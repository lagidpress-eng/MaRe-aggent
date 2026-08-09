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
