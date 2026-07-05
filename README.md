# SmartShell TV + PS Timer

Готовый проект для телевизора в клубе и таймеров зоны PS.

В одном репозитории собраны:

- TV-экран для отображения статусов ПК из SmartShell
- зона `TV` для PS с данными из локального Python-сервера
- Tampermonkey-скрипт `SmartShell Timer` для запуска таймеров из админки SmartShell
- локальный сервер `timer_server.py`, который работает с ESP8266/LED-палками и одновременно раздаёт TV-экран

## Что внутри

```text
smarthell-tv/
├── README.md
├── timer_server.py
├── SmartShell Timer
├── Аватарка.png
├── Прайс ДР.jpg
└── smarthell-tv1/
    └── smarthell-tv/
        ├── README.md
        ├── smartshell-display/
        │   ├── config.js
        │   ├── index.html
        │   ├── css/styles.css
        │   └── js/
        │       ├── api.js
        │       ├── app.js
        │       └── smartshell-sdk.js
        └── tools/
            ├── install-autostart.ps1
            ├── remove-autostart.ps1
            ├── run-display-hidden.vbs
            └── run-display.ps1
```

## Как это работает

- `timer_server.py` запускает Flask-сервер на `http://127.0.0.1:8080`
- TV-экран открывается по адресу `http://127.0.0.1:8080/tv/?tv=1&fullscreen=1`
- статусы ПК берутся из SmartShell SDK
- зона `TV` для PS берётся из `http://127.0.0.1:8080/api/display-zone`
- Tampermonkey-скрипт `SmartShell Timer` управляет таймерами PS и LED-палками через этот же Python-сервер

## Запуск из архива или после git clone

1. Распакуй архив или клонируй репозиторий.
2. Установи Python-зависимости:

```powershell
pip install flask flask-cors requests
```

3. Запусти сервер:

```powershell
python timer_server.py
```

4. Открой TV-экран в браузере:

```text
http://127.0.0.1:8080/tv/?tv=1&fullscreen=1
```

Если нужен просто экран без параметров:

```text
http://127.0.0.1:8080/tv/
```

## Настройка TV-экрана

В правом верхнем углу есть `Настройки`.

Там можно:

- ввести `Company ID`, телефон и пароль SmartShell
- настроить фон, палитру, прозрачность и масштаб карточек
- загрузить кастомный логотип клуба

## Логотип клуба

По умолчанию используется файл `Аватарка.png` из корня репозитория.

Кастомный логотип можно загрузить прямо из настроек экрана.

Рекомендуемый формат:

- `PNG` с прозрачностью
- квадратная картинка
- размер от `512x512` и выше

Поддерживаются также `JPG`, `WEBP` и `SVG`.

## Настройка Tampermonkey

Файл `SmartShell Timer` это userscript для Tampermonkey.

Что нужно сделать:

1. Установить Tampermonkey в браузер.
2. Создать новый userscript.
3. Вставить содержимое файла `SmartShell Timer`.
4. Сохранить.
5. Открыть `admin.smartshell.gg`.

Скрипт будет работать с локальным сервером на `localhost:8080`.

## Настройка зоны PS

IP-адреса ESP8266/LED-палок задаются в `timer_server.py` в словаре `STICKS`.

По умолчанию там три консоли:

- `PS-1`
- `PS-2`
- `PS-3`

Именно они попадают в TV-зону справа от `VIP`.

## Автозапуск на Windows

Если нужно запускать экран на отдельном Windows-ПК без консоли, можно использовать готовые скрипты:

- `smarthell-tv1/smarthell-tv/tools/run-display.ps1`
- `smarthell-tv1/smarthell-tv/tools/run-display-hidden.vbs`
- `smarthell-tv1/smarthell-tv/tools/install-autostart.ps1`

Но текущая основная схема запуска уже не требует отдельного localhost-сервера, потому что экран раздаётся самим `timer_server.py`.

## Важно

- для работы зоны `TV` Python-сервер должен быть запущен
- для работы статусов ПК нужно один раз войти в SmartShell через настройки экрана
- `timers.json`, `config.json` и `__pycache__` не являются частью дистрибутива и создаются локально
- если проект переносится на другой ПК, проверь актуальность IP-адресов палок и доступность Python
