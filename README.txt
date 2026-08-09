MAKE READY AGENT V6 CLEAN

Эта версия полностью пересобрана с нуля.

Файлы для GitHub:
- index.html
- app.js
- styles.css
- data.json
- manifest.json
- service-worker.js
- MyMaps_Poles_with_Open_Card_Links.csv

ВАЖНО:
V6 НЕ регистрирует service worker. Это сделано специально, чтобы телефон не держал старый JavaScript в кэше.

Основные функции:
- список Pole 241-280;
- поиск по Pole и Pole ID;
- фильтр статуса;
- Next Pole -> My Maps;
- My Maps;
- Make Ready PDF;
- Utility Map PDF;
- карточка Pole;
- Start / Completed / Problem;
- 13 видов Production;
- HOA / Anchor / Bonding / VGR / Down Guy;
- BEFORE / AFTER фото с локальным хранением;
- 0/3 счетчики фотографий;
- Save;
- Save & Next -> My Maps;
- Export Production CSV;
- Backup / Restore JSON;
- ?pole=241 автоматически открывает карточку Pole 241.

GitHub:
полностью замени файлы репозитория содержимым этого архива.

После Commit:
открой
https://lagidpress-eng.github.io/MaRe-aggent/?v=6

Если браузер каким-то образом показывает старый сайт, параметр ?v=6 заставит запросить новую страницу.


V7 SIMPLIFIED CARD
Main work order:
1 PLACE NEW STRAND
2 INSTALL DOWNGUY
3 TREE TRIMMING
4 INSTALL POLE GROUND AND BOND
5 PLACE GUARD ARM
6 PLACE DOUBLE GUARD ARM

Rare work moved to Other work.
Removed: Bonding status, VGR status, Down Guy / Anchor actual, Reason / field condition, Crew.
BEFORE and AFTER now have separate Camera and Choose from phone buttons.


V8 GOOGLE SYNC
Client ID:
134936424695-ktnolqsbld9mjhh2qqht0n2pms5cguab.apps.googleusercontent.com

Required Google Cloud APIs:
- Google Drive API
- Google Sheets API

OAuth JavaScript origin:
https://lagidpress-eng.github.io

Scopes:
- drive.file
- spreadsheets

First Connect Google:
1. User approves Google access.
2. App creates folder PRM0001297784.
3. Creates Photos subfolder.
4. Creates Make Ready Agent Data - PRM0001297784 Google Sheet.
5. Syncs all 40 pole records.
6. Uploads unsynced BEFORE/AFTER photos into:
   Photos/<Pole_ProjectPole_ID>/BEFORE
   Photos/<Pole_ProjectPole_ID>/AFTER

Offline/local behavior remains active.
Existing V7 local data/photo storage keys are intentionally retained.
