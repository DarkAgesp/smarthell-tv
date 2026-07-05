# SmartShell TV Display

Готовый экран для телевизора в клубе с подключением к SmartShell SDK.

## Что осталось в проекте

В репозитории оставлены только нужные файлы:

- `smartshell-display/` — сам экран
- `tools/` — запуск без консоли и скрипты автозапуска
- `.gitignore`
- `README.md`

Удалено как неиспользуемое:

- `smartshell-sdk-main/`
- `smartshell-display/js/drag-drop.js`
- Pinegrow-файлы и бэкапы
- старые картинки-превью

## Структура

```text
smarthell-tv/
├── smartshell-display/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── api.js
│   │   ├── app.js
│   │   └── smartshell-sdk.js
│   ├── config.js
│   └── index.html
├── tools/
│   ├── install-autostart.ps1
│   ├── remove-autostart.ps1
│   ├── run-display-hidden.vbs
│   └── run-display.ps1
└── README.md
```

## Локальный запуск

Обычный запуск в браузере:

1. Открой `smartshell-display/index.html`.
2. Или подними локальный сервер любым удобным способом.

## Запуск как localhost без окна консоли

Для Windows уже подготовлен launcher.

Что делает:

- поднимает локальный сервер на `http://127.0.0.1:8090`
- не показывает окно консоли
- открывает экран в браузере в kiosk/fullscreen режиме, если найден Edge или Chrome

Файлы:

- `tools/run-display.ps1` — сам локальный сервер
- `tools/run-display-hidden.vbs` — скрытый запуск без консоли

На другом ПК достаточно запустить:

```powershell
wscript.exe ".\tools\run-display-hidden.vbs"
```

## Автозапуск на другом ПК

Я ничего не ставил в автозапуск на этой машине.

Для другого Windows-ПК:

1. Скопируй проект.
2. Открой PowerShell от имени обычного пользователя.
3. Выполни:

```powershell
powershell -ExecutionPolicy Bypass -File ".\tools\install-autostart.ps1"
```

Скрипт создаст ярлык в папке `Startup`, который будет запускать экран скрытно при входе пользователя.

Удаление из автозапуска:

```powershell
powershell -ExecutionPolicy Bypass -File ".\tools\remove-autostart.ps1"
```

## Настройка экрана

В интерфейсе уже доступны:

- фон: цвет / градиент / картинка
- палитры карточек
- ручной цвет акцента, панелей и текста
- масштаб карточек
- прозрачность карточек

Данные авторизации SmartShell сохраняются в `localStorage` браузера.

## GitHub

У проекта уже настроен `origin`:

```text
https://github.com/DarkAgesp/smarthell-tv.git
```

Локально можно запушить так:

```powershell
git add .
git commit -m "Clean project and add Windows launcher"
git push origin main
```

Если ветка не `main`, сначала посмотри:

```powershell
git branch
```

## Важно

- hidden-launcher и автозапуск рассчитаны на Windows
- сервер работает локально и не требует Node.js
- для автозапуска на другом ПК должен быть разрешён запуск PowerShell/VBS
