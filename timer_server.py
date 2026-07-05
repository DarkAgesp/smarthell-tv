#!/usr/bin/env python3
"""
LED Timer Server
Локальный сервер для управления LED-палками

Установка зависимостей:
    pip install flask requests

Запуск:
    python timer_server.py

После запуска откройте http://localhost:8080
"""

import json
import logging
import threading
import time
from datetime import datetime
import random
from flask import Flask, request, jsonify, render_template_string
from flask_cors import CORS
import requests

# ============== КОНФИГУРАЦИЯ ==============
app = Flask(__name__)
CORS(app)  # Разрешаем CORS для всех маршрутов

# IP адреса LED палок
# Измените на реальные IP адреса ваших палок!
STICKS = {
    'PS-1': '192.168.31.151',
    'PS-2': '192.168.31.74',
    'PS-3': '192.168.31.23',
}

PORT = 8080
HEARTBEAT_INTERVAL = 5  # секунды
STROBE_DURATION = 10    # секунды

# ============== СОСТОЯНИЕ ==============
active_timers = {}  # {timer_id: {...}}
stick_status = {k: {'online': False, 'mode': 'unknown'} for k in STICKS}

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)


def stick_url(stick_id, endpoint=''):
    """Получить URL для палки"""
    ip = STICKS.get(stick_id, STICKS['PS-1'])
    return f"http://{ip}/{endpoint.lstrip('/')}"


def http_get(stick_id, endpoint=''):
    """GET запрос к палке"""
    try:
        url = stick_url(stick_id, endpoint)
        resp = requests.get(url, timeout=2)
        return resp.json()
    except Exception as e:
        log.warning(f"GET {stick_id}/{endpoint}: {e}")
        return None


def http_post(stick_id, endpoint='', data=None):
    """POST запрос к палке"""
    try:
        url = stick_url(stick_id, endpoint)
        log.info(f"POST {url} data={data}")
        resp = requests.post(url, json=data, timeout=5)
        log.info(f"POST response: {resp.status_code} {resp.text[:200]}")
        return resp.json()
    except Exception as e:
        log.warning(f"POST {stick_id}/{endpoint}: {e}")
        return None


# ============== API ENDPOINTS ==============

@app.route('/')
def index():
    """Главная страница"""
    # Формируем список таймеров для отображения
    timers_list = []
    now = int(time.time())
    for tid, t in active_timers.items():
        if t.get('endTime', 0) > now:
            timers_list.append({
                'id': tid,
                'title': t.get('stickId', 'Unknown'),
                'remaining': max(0, t.get('endTime', 0) - now)
            })
    
    return render_template_string(INDEX_HTML, 
                                  sticks=STICKS, 
                                  timers=timers_list,
                                  status=stick_status)


@app.route('/api/status')
def api_status():
    """Статус всех палок"""
    result = {}
    for stick_id, ip in STICKS.items():
        data = http_get(stick_id, 'status')
        if data:
            result[stick_id] = data
            stick_status[stick_id] = {'online': True, 'mode': data.get('mode', 'unknown')}
        else:
            result[stick_id] = {'online': False, 'stickId': stick_id}
            stick_status[stick_id] = {'online': False, 'mode': 'offline'}
    
    return jsonify(result)


@app.route('/api/stick/<stick_id>/status')
def api_stick_status(stick_id):
    """Статус одной палки"""
    data = http_get(stick_id, 'status')
    if data:
        stick_status[stick_id] = {'online': True, 'mode': data.get('mode', 'unknown')}
        return jsonify(data)
    return jsonify({'online': False, 'stickId': stick_id})


@app.route('/api/timer/start', methods=['POST'])
def api_timer_start():
    """Запуск таймера"""
    data = request.json
    log.info(f"Received timer start request: {data}")
    
    stick_id = data.get('stickId', 'PS-1')
    
    # Генерируем ID который помещается в uint32_t (макс 4294967295)
    # Используем последние 8 цифр Unix timestamp
    timer_id = int(time.time()) % 100000000  # Макс 99999999
    
    duration = data.get('duration', 60)  # секунды
    minutes = data.get('minutes')
    
    # Поддержка минут
    if minutes:
        duration = minutes * 60
    
    # Unix timestamp окончания (в СЕКУНДАХ как ожидает прошивка)
    end_timestamp = int(time.time()) + duration
    
    log.info(f"Starting timer {timer_id} on {stick_id}: duration={duration}s, endTs={end_timestamp}")
    
    # Всегда сохраняем локально (даже если палка недоступна)
    active_timers[timer_id] = {
        'id': timer_id,
        'stickId': stick_id,
        'duration': duration,
        'endTime': end_timestamp,  # Unix timestamp в секундах
        'startedAt': int(time.time())
    }
    save_timers()
    
    # Пытаемся отправить на палку
    # Важно: endTimestamp должен быть Unix timestamp в секундах!
    result = http_post(stick_id, 'timer/start', {
        'timerId': timer_id,
        'duration': duration,
        'endTimestamp': end_timestamp
    })
    
    if result and result.get('ok'):
        log.info(f"Timer {timer_id} confirmed by stick")
    else:
        log.warning(f"Timer {timer_id} created locally, stick may not have received")
    
    return jsonify({'ok': True, 'timerId': timer_id})


@app.route('/api/timer/stop', methods=['POST'])
def api_timer_stop():
    """Остановка таймера"""
    data = request.json
    timer_id = data.get('timerId')
    
    if timer_id and timer_id in active_timers:
        timer = active_timers[timer_id]
        http_post(timer['stickId'], 'timer/finish', {})
        del active_timers[timer_id]
        save_timers()
        log.info(f"Timer {timer_id} stopped")
        return jsonify({'ok': True})
    
    return jsonify({'ok': False, 'error': 'Timer not found'})


@app.route('/api/timer/<int:timer_id>')
def api_timer_get(timer_id):
    """Получить информацию о таймере"""
    if timer_id in active_timers:
        timer = active_timers[timer_id].copy()
        timer['remaining'] = max(0, timer['endTime'] - int(time.time()))
        return jsonify(timer)
    return jsonify({'error': 'Not found'}), 404


@app.route('/api/stick/<stick_id>/poweroff', methods=['POST'])
def api_poweroff(stick_id):
    """Выключить LED"""
    result = http_post(stick_id, 'poweroff', {})
    return jsonify(result or {'ok': True})


@app.route('/api/stick/<stick_id>/test', methods=['POST'])
def api_test(stick_id):
    """Тестовая анимация"""
    result = http_post(stick_id, 'animation/test', {})
    return jsonify(result or {'ok': True})


@app.route('/api/stick/<stick_id>/reboot', methods=['POST'])
def api_reboot(stick_id):
    """Перезагрузка палки"""
    result = http_post(stick_id, 'reboot', {})
    return jsonify(result or {'ok': True})


@app.route('/api/stick/<stick_id>/reset', methods=['POST'])
def api_reset(stick_id):
    """Сброс состояния палки - убирает FINISHED"""
    # Сначала останавливаем таймер
    http_post(stick_id, 'timer/finish', {})
    # Затем сбрасываем LED
    result = http_post(stick_id, 'led', {'mode': 'RESET'})
    return jsonify(result or {'ok': True})


@app.route('/api/sticks/reset-all', methods=['POST'])
def api_reset_all():
    """Сброс всех палок - шлём команды по очереди"""
    results = {}
    for stick_id in STICKS:
        # Шлём несколько команд подряд
        http_post(stick_id, 'timer/finish', {})
        http_post(stick_id, 'led', {'mode': 'RESET'})
        http_post(stick_id, 'poweroff', {})
        results[stick_id] = True
    log.info("All sticks reset commands sent")
    return jsonify({'ok': True, 'results': results})


@app.route('/api/stick/<stick_id>/force-off', methods=['POST'])
def api_force_off(stick_id):
    """Принудительное выключение палки - шлём poweroff несколько раз"""
    results = []
    # Шлём команду poweroff 3 раза подряд для надёжности
    for i in range(3):
        result = http_post(stick_id, 'poweroff', {})
        results.append(result)
        log.info(f"Force off attempt {i+1} for {stick_id}: {result}")
    return jsonify({'ok': True, 'attempts': len(results)})


@app.route('/api/stick/<stick_id>/heartbeat', methods=['POST'])
def api_stick_heartbeat(stick_id):
    """Heartbeat от палки - палка спрашивает свой статус"""
    data = request.json or {}
    timer_id = data.get('timerId')
    
    now = int(time.time())
    
    # Проверяем есть ли активный таймер для этой палки
    result = {'ok': True, 'serverTime': now}
    
    for tid, timer in list(active_timers.items()):
        if timer.get('stickId') == stick_id and timer.get('endTime', 0) > now:
            remaining = timer['endTime'] - now
            result['timerRunning'] = True
            result['timerId'] = tid
            result['remaining'] = remaining
            result['endTimestamp'] = timer['endTime']
            
            # Синхронизируем время палки с сервером
            log.info(f"Heartbeat from {stick_id}: timer {tid}, remaining {remaining}s")
            break
    else:
        # Нет активного таймера для этой палки
        result['timerRunning'] = False
        result['timerId'] = 0
        result['remaining'] = 0
    
    return jsonify(result)


@app.route('/api/time', methods=['GET'])
def api_time():
    """Получить текущее время сервера (для синхронизации палок)"""
    return jsonify({
        'serverTime': int(time.time()),
        'serverTimeMs': int(time.time() * 1000)
    })


@app.route('/api/timers', methods=['GET'])
def api_timers_list():
    """Список всех активных таймеров"""
    now = int(time.time())
    
    # Проверяем каждую палку на активные таймеры
    for stick_id, ip in STICKS.items():
        data = http_get(stick_id, 'status')
        if data and data.get('timerRunning'):
            timer_id = data.get('timerId', 0)
            remaining = data.get('remaining', 0)
            
            if remaining > 0 and timer_id not in active_timers:
                # Таймер есть на палке но не в нашем списке
                active_timers[timer_id] = {
                    'id': timer_id,
                    'stickId': stick_id,
                    'duration': remaining,
                    'endTime': now + remaining,
                    'startedAt': now
                }
    
    # Возвращаем активные таймеры
    result = {}
    for timer_id, timer in active_timers.items():
        if timer.get('endTime', 0) > now:
            result[str(timer_id)] = timer
    
    return jsonify(result)


@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    """Получить/сохранить конфигурацию IP адресов"""
    global STICKS
    
    if request.method == 'POST':
        data = request.json
        STICKS = data.get('sticks', STICKS)
        save_config()
        log.info(f"Config updated: {STICKS}")
        return jsonify({'ok': True})
    
    return jsonify({'sticks': STICKS})


# ============== PERSISTENCE ==============

def save_timers():
    """Сохранить таймеры в файл"""
    try:
        with open('timers.json', 'w') as f:
            json.dump(active_timers, f)
    except Exception as e:
        log.error(f"Failed to save timers: {e}")


def load_timers():
    """Загрузить таймеры из файла"""
    global active_timers
    try:
        with open('timers.json', 'r') as f:
            data = json.load(f)
            # Фильтруем устаревшие
            now = int(time.time())
            active_timers = {
                k: v for k, v in data.items()
                if v.get('endTime', 0) > now
            }
            save_timers()
            log.info(f"Loaded {len(active_timers)} active timers")
    except FileNotFoundError:
        pass
    except Exception as e:
        log.error(f"Failed to load timers: {e}")


def save_config():
    """Сохранить конфигурацию"""
    try:
        with open('config.json', 'w') as f:
            json.dump({'sticks': STICKS}, f)
    except Exception as e:
        log.error(f"Failed to save config: {e}")


def load_config():
    """Загрузить конфигурацию"""
    global STICKS
    try:
        with open('config.json', 'r') as f:
            data = json.load(f)
            STICKS = data.get('sticks', STICKS)
    except FileNotFoundError:
        pass


# ============== BACKGROUND TASKS ==============

def heartbeat_worker():
    """Отправка heartbeat для активных таймеров + опрос палок"""
    while True:
        now = int(time.time())
        
        # Удаляем устаревшие
        expired = [tid for tid, t in active_timers.items() 
                   if t.get('endTime', 0) <= now]
        for tid in expired:
            log.info(f"Timer {tid} expired")
            del active_timers[tid]
        
        # Отправляем heartbeat для активных таймеров
        for timer_id, timer in list(active_timers.items()):
            remaining = max(0, timer['endTime'] - now)
            if remaining > 0:
                # Отправляем heartbeat с временем сервера для синхронизации
                http_post(timer['stickId'], 'heartbeat', {
                    'timerId': timer_id,
                    'remaining': remaining,
                    'serverTime': now  # Время сервера для синхронизации
                })
                log.info(f"Heartbeat to {timer['stickId']}: id={timer_id}, remaining={remaining}s, serverTime={now}")
        
        # Опрос каждой палки
        for stick_id in STICKS:
            status = http_get(stick_id, 'status')
            if status:
                stick_status[stick_id] = {'online': True, 'mode': status.get('mode', 'unknown')}
                log.debug(f"Status from {stick_id}: mode={status.get('mode')}, timerRunning={status.get('timerRunning')}")
                
                if status.get('timerRunning'):
                    stick_timer_id = status.get('timerId')
                    stick_remaining = status.get('remaining', 0)
                    
                    if stick_timer_id and str(stick_timer_id) not in active_timers:
                        log.info(f"Found timer on {stick_id}: {stick_timer_id}, {stick_remaining}s remaining")
                        active_timers[stick_timer_id] = {
                            'id': stick_timer_id,
                            'stickId': stick_id,
                            'duration': 0,
                            'endTime': now + stick_remaining,
                            'startedAt': now
                        }
                        save_timers()
            else:
                stick_status[stick_id] = {'online': False, 'mode': 'offline'}
        
        save_timers()
        time.sleep(HEARTBEAT_INTERVAL + random.uniform(0, 2))


# ============== HTML TEMPLATE ==============

INDEX_HTML = '''
<!DOCTYPE html>
<html>
<head>
    <title>LED Timer Controller</title>
    <meta charset="utf-8">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: Arial, sans-serif; 
            background: #1a1a2e; 
            color: #fff; 
            padding: 20px;
            min-height: 100vh;
        }
        h1 { color: #00ff88; margin-bottom: 20px; }
        h2 { color: #fff; margin: 20px 0 10px; font-size: 18px; }
        
        .container { max-width: 900px; margin: 0 auto; }
        
        .sticks { display: flex; gap: 15px; flex-wrap: wrap; margin-bottom: 30px; }
        
        .stick-card {
            background: #16213e;
            border-radius: 12px;
            padding: 20px;
            min-width: 200px;
            border: 2px solid #333;
        }
        
        .stick-card.online { border-color: #00ff88; }
        .stick-card.offline { border-color: #e74c3c; opacity: 0.7; }
        .stick-card.stuck { border-color: #f39c12; animation: pulse-stuck 1s infinite; }
        
        @keyframes pulse-stuck {
            0%, 100% { box-shadow: 0 0 10px rgba(243, 156, 18, 0.3); }
            50% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.6); }
        }
        
        .stick-name { font-size: 20px; font-weight: bold; margin-bottom: 10px; }
        .stick-ip { color: #888; font-size: 14px; margin-bottom: 10px; }
        .stick-mode { font-size: 14px; margin-bottom: 15px; }
        .stick-mode.active { color: #f39c12; }
        .stick-mode.idle { color: #00ff88; }
        .stick-mode.finished { color: #e74c3c; }
        
        .stick-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn {
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .btn-test { background: #3498db; color: white; }
        .btn-off { background: #e74c3c; color: white; }
        .btn-reboot { background: #9b59b6; color: white; }
        .btn-reset { background: #f39c12; color: white; }
        
        .timers { background: #16213e; border-radius: 12px; padding: 20px; }
        
        .timer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: #1a1a2e;
            border-radius: 8px;
            margin-bottom: 10px;
        }
        
        .timer-info { flex: 1; }
        .timer-title { font-size: 16px; margin-bottom: 5px; }
        .timer-time { 
            font-size: 24px; 
            font-weight: bold; 
            font-family: monospace;
            color: #00ff88;
        }
        .timer-time.warning { color: #ff6b6b; }
        .timer-time.finished { color: #e74c3c; }
        
        .timer-actions { display: flex; gap: 10px; }
        
        .new-timer {
            background: #16213e;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
        }
        
        .form-row {
            display: flex;
            gap: 15px;
            margin-bottom: 15px;
        }
        
        .form-group { flex: 1; }
        .form-group label { display: block; margin-bottom: 8px; color: #888; }
        .form-group select, .form-group input {
            width: 100%;
            padding: 12px;
            background: #1a1a2e;
            border: 1px solid #333;
            border-radius: 8px;
            color: #fff;
            font-size: 16px;
        }
        
        .btn-start {
            width: 100%;
            padding: 15px;
            background: #00ff88;
            color: #1a1a2e;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }
        .btn-start:hover { background: #00cc6a; }
        
        .ip-config {
            background: #16213e;
            padding: 15px;
            border-radius: 12px;
            margin-top: 20px;
        }
        
        .ip-row {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
        }
        .ip-row label { width: 60px; color: #888; }
        .ip-row input { flex: 1; padding: 8px; background: #1a1a2e; border: 1px solid #333; border-radius: 4px; color: #fff; }
        
        /* Управление палками */
        .control-panel {
            background: #16213e;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            border: 2px solid #e74c3c;
        }
        
        .control-panel h2 {
            color: #e74c3c;
            margin-top: 0;
        }
        
        .control-description {
            color: #888;
            font-size: 14px;
            margin-bottom: 15px;
        }
        
        .stick-controls {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .stick-control-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #1a1a2e;
            padding: 12px 15px;
            border-radius: 8px;
            border: 1px solid #333;
        }
        
        .stick-control-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }
        
        .stick-control-name {
            font-weight: bold;
            min-width: 60px;
        }
        
        .stick-control-status {
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 4px;
        }
        
        .stick-control-status.online { background: #00ff88; color: #1a1a2e; }
        .stick-control-status.offline { background: #e74c3c; color: white; }
        .stick-control-status.stuck { background: #f39c12; color: white; }
        
        .stick-control-btns {
            display: flex;
            gap: 8px;
        }
        
        .btn-force {
            background: #e74c3c;
            color: white;
            padding: 10px 16px;
            font-weight: bold;
        }
        
        .btn-force:hover { background: #c0392b; }
        
        .btn-reset-stick {
            background: #f39c12;
            color: white;
            padding: 10px 16px;
            font-weight: bold;
        }
        
        .btn-reset-stick:hover { background: #d68910; }
        
        .btn-reset-all {
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            color: white;
            padding: 15px 30px;
            font-size: 16px;
            font-weight: bold;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            margin-top: 15px;
            width: 100%;
        }
        
        .btn-reset-all:hover { 
            transform: scale(1.02);
            box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
        }
        
        /* Debug panel */
        .debug-panel {
            background: #111;
            border-radius: 12px;
            padding: 15px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 12px;
            border: 1px solid #333;
        }
        
        .debug-panel h3 {
            color: #888;
            margin: 0 0 10px 0;
            font-size: 14px;
        }
        
        .debug-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            border-bottom: 1px solid #222;
        }
        
        .debug-label { color: #666; }
        .debug-value { color: #00ff88; }
        .debug-warning { color: #f39c12; }
        .debug-error { color: #e74c3c; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎮 LED Timer Controller</h1>
        
        <!-- ПАНЕЛЬ УПРАВЛЕНИЯ ПАЛКАМИ -->
        <div class="control-panel">
            <h2>⚠️ Управление палками</h2>
            <p class="control-description">
                Если палка зависла и горит зелёным постоянно — нажмите "Сброс" или "Принудительно выкл".<br>
                Кнопка "Сброс" останавливает таймер и сбрасывает LED.<br>
                Кнопка "Выкл" — принудительное выключение (несколько методов подряд).
            </p>
            
            <div class="stick-controls" id="stickControls">
                {% for stick_id, ip in sticks.items() %}
                <div class="stick-control-row" id="control-{{ stick_id }}">
                    <div class="stick-control-info">
                        <span class="stick-control-name">{{ stick_id }}</span>
                        <span class="stick-control-status offline" id="status-{{ stick_id }}">Офлайн</span>
                    </div>
                    <div class="stick-control-btns">
                        <button class="btn btn-reset-stick" onclick="resetStick('{{ stick_id }}')">🔄 Сброс</button>
                        <button class="btn btn-force" onclick="forceOffStick('{{ stick_id }}')">⭕ Выкл</button>
                    </div>
                </div>
                {% endfor %}
            </div>
            
            <button class="btn-reset-all" onclick="resetAllSticks()">
                🚨 СБРОСИТЬ ВСЕ ПАЛКИ
            </button>
        </div>
        
        <h2>📊 Статус палок</h2>
        <div class="sticks" id="sticks">
            {% for stick_id, ip in sticks.items() %}
            <div class="stick-card {% if status.get(stick_id, {}).get('online', False) %}online{% else %}offline{% endif %}" id="stick-{{ stick_id }}">
                <div class="stick-name">{{ stick_id }}</div>
                <div class="stick-ip">{{ ip }}</div>
                <div class="stick-mode">
                    {{ status.get(stick_id, {}).get('mode', 'OFFLINE').upper() }}
                </div>
                <div class="stick-btns">
                    <button class="btn btn-test" onclick="testStick('{{ stick_id }}')">Тест</button>
                    <button class="btn btn-off" onclick="offStick('{{ stick_id }}')">Выкл</button>
                    <button class="btn btn-reboot" onclick="rebootStick('{{ stick_id }}')">↻</button>
                    <button class="btn btn-reset" onclick="resetStick('{{ stick_id }}')">Сброс</button>
                </div>
            </div>
            {% endfor %}
        </div>
        
        <h2>⏱️ Активные таймеры</h2>
        <div class="timers" id="timers">
            <div style="color: #888; text-align: center; padding: 20px;">
                Нет активных таймеров
            </div>
        </div>
        
        <div class="new-timer">
            <h2>➕ Новый таймер</h2>
            <form id="timerForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Консоль</label>
                        <select id="stickSelect">
                            {% for stick_id in sticks.keys() %}
                            <option value="{{ stick_id }}">{{ stick_id }}</option>
                            {% endfor %}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Минуты</label>
                        <input type="number" id="minutesInput" value="60" min="1" max="480">
                    </div>
                </div>
                <button type="submit" class="btn-start">▶️ Запустить таймер</button>
            </form>
        </div>
        
        <div class="ip-config">
            <h2>⚙️ IP адреса палок</h2>
            <div id="ipConfig">
                {% for stick_id, ip in sticks.items() %}
                <div class="ip-row">
                    <label>{{ stick_id }}:</label>
                    <input type="text" value="{{ ip }}" id="ip-{{ stick_id }}">
                </div>
                {% endfor %}
            </div>
            <button class="btn-start" style="background: #3498db; margin-top: 10px;" onclick="saveConfig()">
                💾 Сохранить IP
            </button>
        </div>
        
        <!-- DEBUG PANEL -->
        <div class="debug-panel" id="debugPanel" style="display: none;">
            <h3>🔧 Debug Info</h3>
            <div id="debugContent"></div>
        </div>
    </div>
    
    <script>
        const API = '';
        let timers = {};
        let serverTimeOffset = 0;
        let lastDebugUpdate = 0;
        
        // ===== Синхронизация времени =====
        
        function syncTime() {
            const clientTime = Date.now();
            fetch(API + '/api/time')
                .then(r => r.json())
                .then(data => {
                    const serverTime = data.serverTimeMs;
                    serverTimeOffset = serverTime - clientTime;
                    console.log('[TIME] Server time synced, offset:', serverTimeOffset, 'ms');
                })
                .catch(e => console.error('[TIME] Sync failed:', e));
        }
        
        function getServerTime() {
            return Date.now() + serverTimeOffset;
        }
        
        // Запускаем синхронизацию при загрузке
        syncTime();
        setInterval(syncTime, 60000); // Каждую минуту
        
        // ===== Debug panel =====
        
        // Включаем debug по умолчанию для диагностики
        let debugEnabled = localStorage.getItem('st_debug') !== 'false';
        
        function toggleDebug() {
            debugEnabled = !debugEnabled;
            localStorage.setItem('st_debug', debugEnabled);
            document.getElementById('debugPanel').style.display = debugEnabled ? 'block' : 'none';
        }
        
        document.getElementById('debugPanel').style.display = debugEnabled ? 'block' : 'none';
        
        function updateDebug() {
            if (!debugEnabled) return;
            
            const now = Date.now();
            if (now - lastDebugUpdate < 1000) return;
            lastDebugUpdate = now;
            
            const content = document.getElementById('debugContent');
            const clientTime = new Date().toISOString();
            const serverTime = new Date(getServerTime()).toISOString();
            const offset = Math.round(serverTimeOffset);
            
            let html = `
                <div class="debug-row">
                    <span class="debug-label">Client Time:</span>
                    <span class="debug-value">${clientTime}</span>
                </div>
                <div class="debug-row">
                    <span class="debug-label">Server Time:</span>
                    <span class="debug-value">${serverTime}</span>
                </div>
                <div class="debug-row">
                    <span class="debug-label">Time Offset:</span>
                    <span class="${offset > 1000 ? 'debug-warning' : 'debug-value'}">${offset}ms</span>
                </div>
            `;
            
            // Добавляем информацию о таймерах
            Object.values(timers).forEach(t => {
                const serverNow = Math.floor(getServerTime() / 1000);
                const remaining = Math.max(0, t.endTime - serverNow);
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                html += `
                    <div class="debug-row">
                        <span class="debug-label">Timer ${t.stickId}:</span>
                        <span class="debug-value">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')} (endTs: ${t.endTime})</span>
                    </div>
                `;
            });
            
            content.innerHTML = html;
        }
        
        // Клик по заголовку debug панели включает/выключает
        document.getElementById('debugPanel').querySelector('h3').style.cursor = 'pointer';
        document.getElementById('debugPanel').querySelector('h3').onclick = toggleDebug;
        
        // ===== Управление палками =====
        
        function resetStick(stickId) {
            if (!confirm('Сбросить палку ' + stickId + '?\\n\\nЭто остановит таймер и сбросит LED.')) return;
            
            fetch(API + '/api/stick/' + stickId + '/reset', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            })
            .then(r => r.json())
            .then(data => {
                if (data.ok) {
                    showNotification(stickId + ' сброшена', 'success');
                    setTimeout(updateStatus, 500);
                }
            })
            .catch(e => {
                showNotification('Ошибка сброса ' + stickId, 'error');
            });
        }
        
        function forceOffStick(stickId) {
            if (!confirm('Принудительно выключить палку ' + stickId + '?\\n\\nБудут отправлены несколько команд подряд для полного отключения.')) return;
            
            fetch(API + '/api/stick/' + stickId + '/force-off', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            })
            .then(r => r.json())
            .then(data => {
                showNotification(stickId + ' выключается...', 'success');
                setTimeout(updateStatus, 1000);
            })
            .catch(e => {
                showNotification('Ошибка выключения ' + stickId, 'error');
            });
        }
        
        function resetAllSticks() {
            if (!confirm('СБРОСИТЬ ВСЕ ПАЛКИ?\\n\\nЭто остановит все таймеры и выключит все LED палки.\\n\\nПродолжить?')) return;
            
            fetch(API + '/api/sticks/reset-all', { 
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            })
            .then(r => r.json())
            .then(data => {
                if (data.ok) {
                    showNotification('Все палки сброшены!', 'success');
                    setTimeout(updateStatus, 1000);
                }
            })
            .catch(e => {
                showNotification('Ошибка сброса', 'error');
            });
        }
        
        function showNotification(message, type) {
            const notif = document.createElement('div');
            notif.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                padding: 15px 25px;
                background: ${type === 'success' ? '#00ff88' : '#e74c3c'};
                color: #1a1a2e;
                border-radius: 8px;
                font-weight: bold;
                z-index: 10000;
                animation: slideIn 0.3s ease;
            `;
            notif.textContent = message;
            document.body.appendChild(notif);
            
            setTimeout(() => {
                notif.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notif.remove(), 300);
            }, 2000);
        }
        
        // ===== Статус палок =====
        
        function updateStatus() {
            fetch(API + '/api/status')
                .then(r => r.json())
                .then(data => {
                    Object.keys(data).forEach(stickId => {
                        const stickEl = document.getElementById('stick-' + stickId);
                        const controlEl = document.getElementById('control-' + stickId);
                        const statusEl = document.getElementById('status-' + stickId);
                        const modeEl = stickEl ? stickEl.querySelector('.stick-mode') : null;
                        
                        const isOnline = data[stickId].online;
                        const mode = data[stickId].mode || 'offline';
                        
                        // Определяем зависла ли палка (горит постоянно)
                        const isStuck = isOnline && mode !== 'IDLE' && mode !== 'TIMER' && mode !== 'STANDBY';
                        
                        if (stickEl) {
                            stickEl.className = 'stick-card ' + (isOnline ? 'online' : 'offline');
                            if (isStuck) stickEl.classList.add('stuck');
                        }
                        
                        if (statusEl) {
                            if (!isOnline) {
                                statusEl.textContent = 'Офлайн';
                                statusEl.className = 'stick-control-status offline';
                            } else if (isStuck) {
                                statusEl.textContent = 'ЗАВИСЛА';
                                statusEl.className = 'stick-control-status stuck';
                            } else {
                                statusEl.textContent = mode;
                                statusEl.className = 'stick-control-status online';
                            }
                        }
                        
                        if (modeEl) {
                            modeEl.textContent = mode || 'OFFLINE';
                            modeEl.className = 'stick-mode ' + (mode || 'offline').toLowerCase();
                        }
                    });
                })
                .catch(e => console.error('Status update error:', e));
        }
        
        // ===== Таймеры =====
        
        function updateTimers() {
            fetch(API + '/api/timers')
                .then(r => r.json())
                .then(data => {
                    timers = data;
                    renderTimers();
                })
                .catch(e => console.error(e));
        }
        
        function renderTimers() {
            const container = document.getElementById('timers');
            // Используем серверное время для синхронизации с палками
            const now = Math.floor(getServerTime() / 1000);
            
            if (Object.keys(timers).length === 0) {
                container.innerHTML = '<div style="color: #888; text-align: center; padding: 20px;">Нет активных таймеров</div>';
                return;
            }
            
            container.innerHTML = Object.values(timers).map(t => {
                const remaining = Math.max(0, t.endTime - now);
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                const isWarning = remaining <= 300;
                const isFinished = remaining <= 0;
                
                return `
                    <div class="timer-row">
                        <div class="timer-info">
                            <div class="timer-title">${t.stickId} #${t.id}</div>
                            <div class="timer-time ${isWarning ? 'warning' : ''} ${isFinished ? 'finished' : ''}">
                                ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}
                            </div>
                        </div>
                        <div class="timer-actions">
                            <button class="btn btn-off" onclick="stopTimer(${t.id})">Стоп</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        function startTimer(stickId, minutes) {
            fetch(API + '/api/timer/start', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ stickId, minutes })
            })
            .then(r => r.json())
            .then(data => {
                if (data.ok) {
                    document.getElementById('minutesInput').value = 60;
                    updateTimers();
                }
            });
        }
        
        function stopTimer(timerId) {
            fetch(API + '/api/timer/stop', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ timerId })
            })
            .then(() => updateTimers());
        }
        
        function testStick(stickId) {
            fetch(API + '/api/stick/' + stickId + '/test', { method: 'POST' });
        }
        
        function offStick(stickId) {
            fetch(API + '/api/stick/' + stickId + '/poweroff', { method: 'POST' });
        }
        
        function rebootStick(stickId) {
            if (confirm('Перезагрузить ' + stickId + '?')) {
                fetch(API + '/api/stick/' + stickId + '/reboot', { method: 'POST' });
                setTimeout(updateStatus, 3000);
            }
        }
        
        function saveConfig() {
            const sticks = {};
            {% for stick_id in sticks.keys() %}
            sticks['{{ stick_id }}'] = document.getElementById('ip-{{ stick_id }}').value;
            {% endfor %}
            
            fetch(API + '/api/config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ sticks })
            })
            .then(r => r.json())
            .then(() => showNotification('IP адреса сохранены!', 'success'));
        }
        
        // ===== CSS анимации =====
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(-50%) translateY(0); opacity: 1; }
                to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        
        // ===== Инициализация =====
        
        // Form submit
        document.getElementById('timerForm').onsubmit = (e) => {
            e.preventDefault();
            const stickId = document.getElementById('stickSelect').value;
            const minutes = parseInt(document.getElementById('minutesInput').value) || 60;
            startTimer(stickId, minutes);
        };
        
        // Обновление каждые 3 секунды
        setInterval(renderTimers, 1000);
        setInterval(updateStatus, 3000);
        setInterval(updateDebug, 1000);
        
        // Начальное обновление
        updateStatus();
        renderTimers();
        syncTime(); // Начальная синхронизация времени
    </script>
</body>
</html>
'''


# ============== STARTUP ==============

if __name__ == '__main__':
    print("=" * 50)
    print("   LED Timer Server")
    print("=" * 50)
    print(f"   Open: http://localhost:{PORT}")
    print("=" * 50)
    
    # Загружаем конфигурацию
    load_config()
    load_timers()
    
    # Запускаем heartbeat в фоне
    heartbeat_thread = threading.Thread(target=heartbeat_worker, daemon=True)
    heartbeat_thread.start()
    
    # Запускаем сервер
    app.run(host='0.0.0.0', port=PORT, debug=False)