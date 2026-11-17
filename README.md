# MatchGame

ปาร์ตี้เกมสำหรับ 2 ผู้เล่นแบบ Real-time ผ่าน Browser — มี 2 เกมในเว็บเดียว เลือกได้จากหน้าแรก

| เกม | แนว | สรุป |
| --- | --- | --- |
| **Match Word** · พิมพ์จนกว่าคำจะตรงกัน | ร่วมมือกัน | ต่างคนพิมพ์คำแล้วเปิดพร้อมกัน หาคำ “ตรงกลาง” ระหว่างสองคำล่าสุดไปเรื่อย ๆ จนกว่าจะพิมพ์คำเดียวกัน |
| **MatchCharacter** · ทายตัวละครจากลักษณะเด่น | แข่งกัน | ใบ้ลักษณะเด่นคนละอย่าง แล้วแข่งกันหาตัวละครที่มีทั้งสองอย่าง ใครตอบก่อนและอีกฝ่าย Agree ได้แต้ม |

ออกแบบให้เล่นบน **มือถือ, iPad (แนวตั้ง/แนวนอน) และ Laptop** เป็นหลัก

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`client/`)
- **Backend:** Node.js + Express + Socket.IO (`server/`) — Match Word ใช้ namespace `/`, MatchCharacter ใช้ `/character`
- **Shared:** ชนิดข้อมูล, event และกฎของทั้งสองเกมที่ใช้ร่วมกัน (`shared/`)
- **Storage:** เก็บในหน่วยความจำของ Server เท่านั้น (ไม่มี Database) — รีสตาร์ท Server แล้วห้องหายได้

---

## เริ่มใช้งาน (Local Development)

ต้องมี Node.js 20 ขึ้นไป

```bash
npm install
```

```bash
npm run dev
```

- เปิด `http://localhost:5173` บนเครื่องนี้ → เลือกเกม → สร้างห้อง → ส่ง Invite Link ให้เพื่อน
- **เล่นกับมือถือ / iPad:** ให้อุปกรณ์ต่อ Wi-Fi เดียวกับคอมพิวเตอร์ แล้วเปิด URL `Network` ที่ Vite แสดง (เช่น `http://192.168.1.20:5173`)
  ลิงก์เชิญในหน้า Lobby จะเปลี่ยนเป็น IP ในวง Wi-Fi ให้อัตโนมัติ
- **เล่นผ่านอินเทอร์เน็ต (คนละที่):** เปิด Cloudflare quick tunnel ไปที่ server แล้วแชร์ลิงก์ `https://….trycloudflare.com`
  (tunnel เสิร์ฟหน้าเว็บที่ build แล้ว — แก้โค้ดแล้วให้รัน `npm run build -w client` ใหม่)
  ```bash
  cloudflared tunnel --url http://localhost:3001
  ```
- **ทดสอบคนเดียวบนเครื่องเดียว:** เปิด 2 แท็บ — แต่ละแท็บเป็นผู้เล่นคนละคน (session เก็บแยกต่อแท็บ)

`npm run dev` จะรัน 2 process พร้อมกัน: Socket.IO server ที่พอร์ต `3001` และ Vite ที่พอร์ต `5173` (Vite proxy `/socket.io` และ `/api` ไปที่ server)

## คำสั่งอื่น ๆ

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm test` | รัน unit + integration tests ของ server ทั้งสองเกม (เล่นเกมจริงผ่าน Socket.IO, จับเวลาแบบย่อ) |
| `npm run typecheck` | ตรวจ TypeScript ทั้ง server และ client |
| `npm run build` | build client (`client/dist`) และ bundle server (`server/dist/index.js`) |
| `npm start` | รัน production server — เสิร์ฟทั้งหน้าเว็บและ Socket.IO จากพอร์ตเดียว |

## Deploy

**แบบที่ 1 — Server เดียว (ง่ายที่สุด):** บน Hosting ที่รองรับ Node.js

```bash
npm install && npm run build && npm start
```

Server ใช้ `PORT` จาก Hosting (ค่าเริ่มต้น 3001) และเสิร์ฟ `client/dist` ให้อัตโนมัติ

**แบบที่ 2 — แยก Frontend / Backend:**

- Backend: `npm run build -w server && npm start` และตั้ง `CLIENT_ORIGIN=https://your-frontend.example` (คั่นหลายค่าด้วย `,`)
- Frontend: ตั้ง `VITE_SERVER_URL=https://your-backend.example` แล้ว `npm run build -w client` นำ `client/dist` ไปวางบน static hosting

| ตัวแปร | ใช้ที่ | ความหมาย |
| --- | --- | --- |
| `PORT` | server (production) | พอร์ตที่ Server ฟัง |
| `SERVER_PORT` | server (dev) | พอร์ต Socket.IO ตอน `npm run dev` (ค่าเริ่มต้น 3001) |
| `HOST` | server | ค่าเริ่มต้น `0.0.0.0` |
| `CLIENT_ORIGIN` | server | origin ที่อนุญาต (CORS) เมื่อแยก Frontend; ไม่ตั้ง = อนุญาตทุก origin |
| `STATIC_DIR` | server | โฟลเดอร์ของ client ที่ build แล้ว (ค่าเริ่มต้น `client/dist`) |
| `VITE_SERVER_URL` | client (ตอน build) | URL ของ Backend เมื่อโฮสต์แยกกัน |
| `CHARACTER_IMAGES` | server | ตั้งเป็น `off` เพื่อปิดการค้นรูปตัวละครของ MatchCharacter |

> ข้อควรรู้: ห้องทั้งหมดอยู่ใน Memory ของ process เดียว จึงควรรัน Server แค่ 1 instance

---

## หน้าแรก · เลือกเกม

- การ์ดใหญ่ 2 ใบ (Match Word ธีมม่วง-น้ำเงิน / MatchCharacter ธีม Pop ส้ม-ชมพู)
- ช่อง **“มีรหัสห้องแล้ว?”** — ใส่รหัส 6 ตัว ระบบถาม server (`GET /api/rooms/:code`) แล้วพาไปเกมที่ถูกต้องเอง
- รหัสห้องไม่ซ้ำกันข้ามเกม · ลิงก์เชิญเป็น `?game=word|character&room=CODE` · ลิงก์เก่าแบบ `?room=CODE` ก็ยังใช้ได้
- พิมพ์รหัสของอีกเกมในช่อง Join จะถูกพาไปเกมนั้นให้อัตโนมัติ

ทั้งสองเกมใช้ระบบห้องเดียวกัน: ห้องละ 2 คน (คนสร้าง = Player A / Host), คนที่ 3 เข้าไม่ได้,
หลุดการเชื่อมต่อกลับเข้าห้องได้ภายใน 60 วินาที (ถ้าไม่กลับมา อีกฝ่ายกลายเป็น Host ของห้องที่รอผู้เล่นใหม่),
และ “เล่นอีกครั้ง” ต้องกดทั้งคู่ — Server เป็นผู้ควบคุมสถานะเกม, Timer, การตรวจ และตัดสินผลทั้งหมด

---

## เกม 1 · Match Word (พิมพ์จนกว่าคำจะตรงกัน)

- **รอบเปิด (คำเริ่มต้น):** ทั้งคู่พิมพ์คำอะไรก็ได้ แล้วกด Ready → เมื่อ Ready ครบนับ 3-2-1 → เปิดคำพร้อมกัน
- **รอบเชื่อมคำ:** นำคำล่าสุดของทั้งคู่เป็นโจทย์ → พิมพ์คำเชื่อม → Ready → 3-2-1 → เปิดคำ
  ไม่ตรง = คำล่าสุดกลายเป็นโจทย์ใหม่และเพิ่มเลขรอบ · ตรง = จบเกม
- **Strict Matching:** ตัดช่องว่างหัวท้าย + Unicode NFC, ตัวพิมพ์เล็ก/ใหญ่ต่างกันนับว่าไม่ตรง
  (`ไอติม` ≠ `ไอศกรีม`, `Apple` ≠ `apple`, `กาแฟ` ≠ `กาแฟดำ`) — ไม่มี AI / คำพ้อง / fuzzy
- **ห้ามคำซ้ำของตัวเอง:** ตรวจแยกรายผู้เล่น คำที่อีกฝ่ายเคยใช้ยังใช้ได้ (เตือนทันทีขณะพิมพ์ และ Server ตรวจซ้ำอีกชั้น)
- **Timer:** Host เลือก 15/20/30/45/60 วินาที (ค่าเริ่มต้น 30)
  หมดเวลา → ไม่เปิดคำ, ไม่เปลี่ยนโจทย์, ไม่เพิ่มรอบ, ล้างคำตอบและ Ready แล้วเริ่มรอบเดิมใหม่ (“หมดเวลา! เริ่มรอบเดิมใหม่”)
- กด Ready แล้วแก้คำตอบไม่ได้ · คำตอบของอีกฝ่ายไม่ถูกส่งมาที่เครื่องเราจนกว่าจะ Reveal

**States:** `WAITING_FOR_PLAYERS → LOBBY → INITIAL_INPUT → (WAITING_FOR_READY) → COUNTDOWN → REVEAL → ROUND_INPUT → … → GAME_OVER`

**Client → Server:** `create_room`, `join_room`, `update_settings`, `start_game`, `submit_initial_word`, `submit_answer`, `player_ready`, `leave_room`, `request_rematch`
**Server → Client:** `room_created`, `room_joined`, `player_joined`, `player_left`, `room_updated`, `game_started`, `initial_words_revealed`, `round_started`,
`player_ready_updated`, `countdown_started`, `reveal_answers`, `round_result`, `round_timeout`, `game_won`, `game_error`, `left_room`

---

## เกม 2 · MatchCharacter (ทายตัวละครจากลักษณะเด่น)

**ตั้งค่าโดย Host** (ตอนสร้างห้อง แก้ได้ใน Lobby):

- **หมวดหมู่ (checklist):** ติ๊กได้หลายหมวดจาก 🍥 อนิเมะ / 📺 ซีรีส์ / 🎬 หนัง หรือกด “เลือกทั้งหมด” (ค่าเริ่มต้น: ทั้งหมด, ต้องเลือกอย่างน้อย 1 หมวด)
  เลือกหลายหมวด → **แต่ละรอบสุ่มหมวดจากที่เลือก** แบบเวียนให้ครบทุกหมวดก่อนวนซ้ำ และไม่ซ้ำหมวดเดิมติดกัน
  หมวดของรอบขึ้นชัด ๆ ตั้งแต่ตอนพิมพ์ใบ้ และใช้กับป้ายช่องตอบ ตัวอย่าง และการค้นรูปของรอบนั้น
- **แต้มเป้าหมาย** 3 / 5 / 7 · **เวลาหาคำตอบ** 60 / 90 / 120 / 180 วินาที หรือ ∞ ไม่จับเวลา

**แต่ละรอบ**

1. **ใบ้ (แบบลับ):** ต่างคนพิมพ์ลักษณะเด่นของตัวละคร 1 อย่าง (เช่น A = “ผมสีทอง”, B = “มีพลังพิเศษ”) → Ready
   → เมื่อ Ready ครบนับ 3-2-1 แล้วเปิดใบ้ทั้งสองพร้อมกัน
2. **แข่งตอบ:** เวลาเริ่มเดิน ทั้งคู่พิมพ์ **ชื่อตัวละคร** + **ชื่อเรื่อง** (เช่น Goku จาก Dragon Ball) — ใครกด **“ตอบ!”** ก่อนได้สิทธิ์
   ไม่ต้องรออีกฝ่าย: ขึ้นเต็มจอว่า **“A ได้คำตอบแล้ว!!”** ทั้งสองเครื่อง (สิ่งที่อีกฝ่ายพิมพ์ค้างไว้ไม่หาย)
3. **ตัดสิน:** เด้งไปหน้าคำตอบของ A ให้ B กด **Agree** หรือ **Disagree** (เวลาหยุดเดินระหว่างรอตัดสิน)
   - **Agree** → A ได้ +1 แต้ม → รอบใหม่
   - **Disagree** → กลับไปแข่งตอบต่อด้วยใบ้เดิม: A แก้คำตอบได้ (ส่งคำตอบเดิมที่โดนปฏิเสธซ้ำไม่ได้) และ B ก็ยังแข่งตอบได้
4. **หมดเวลา** หรือกด **“ขอข้ามรอบ”** ทั้งคู่ → ไม่มีใครได้แต้ม → รอบใหม่

**จบเกม:** ใครถึงแต้มเป้าหมายก่อนชนะ · **ห้ามตอบตัวละครซ้ำทั้งเกม** (ตัวที่ได้แต้มไปแล้ว — เทียบชื่อแบบไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง)

### รูปตัวละคร / ปกเรื่อง

พอมีคนกด “ตอบ!” server จะค้นรูปให้อัตโนมัติ (ระหว่างหน้าจอ “ได้คำตอบแล้ว!!”) แล้วแสดงรูปตัวละคร + ปกเรื่อง
ในหน้า Agree / Disagree, หน้าผลรอบ, ประวัติรอบ, ตัวละครที่ใช้แล้ว และแกลเลอรีในหน้าชนะ — ทั้งสองเครื่องเห็นรูปเดียวกัน

| หมวด | แหล่งรูป |
| --- | --- |
| 🍥 อนิเมะ | [AniList](https://anilist.co) — รูปตัวละคร + ปกเรื่อง (ใช้ชื่อเรื่องช่วยเลือกตัวที่ชื่อซ้ำกัน) · ถ้าไม่เจอใช้ Wikipedia |
| 📺 ซีรีส์ · 🎬 หนัง | [Wikipedia](https://www.wikipedia.org) — รูปประจำหน้าของตัวละคร + โปสเตอร์ของเรื่อง |

- ชื่อภาษาไทยค้นจาก th.wikipedia.org · รับเฉพาะหน้าที่ชื่อตรงกับที่พิมพ์ (ไม่เจอ = แสดงตัวอักษรแทน ดีกว่าแสดงรูปผิด)
- เป็นการค้นแบบ “เดาให้ดีที่สุด” — ใต้รูปมีเครดิตแหล่งที่มาและหมายเหตุว่าอาจไม่ตรงตัว
- ไม่ทำให้เกมช้า: ค้นได้ไม่เกิน ~2.5 วินาที, เก็บผลไว้ในหน่วยความจำ 6 ชั่วโมง, ยิงพร้อมกันไม่เกิน 2 คำขอต่อแหล่ง และถ้าแหล่งตอบ 429 (ถี่เกิน) จะพักแหล่งนั้นตามเวลาที่ขอ
- รูปแสดงจากลิงก์ของ AniList / Wikimedia โดยตรง (ไม่ดาวน์โหลดมาเก็บ) · ชื่อตัวละครและชื่อเรื่องที่ผู้เล่นพิมพ์จะถูกส่งไปค้นที่ AniList / Wikipedia
- ปิดการค้นรูปได้ด้วย `CHARACTER_IMAGES=off` (เช่น เล่นแบบไม่มีอินเทอร์เน็ต)

**States:** `WAITING_FOR_PLAYERS → LOBBY → CLUE_INPUT → CLUE_COUNTDOWN → CLUE_REVEAL → RACING ⇄ (BUZZED → REVIEW) → ROUND_END → CLUE_INPUT … → GAME_OVER`

**Client → Server:** `create_room`, `join_room`, `update_settings`, `start_game`, `submit_clue`, `submit_answer`, `judge_answer`, `vote_skip`, `leave_room`, `request_rematch`
**Server → Client:** `room_created`, `room_joined`, `room_updated`, `player_joined`, `player_left`, `game_started`, `clue_ready_updated`, `countdown_started`,
`clues_revealed`, `racing_started`, `answer_buzzed`, `answer_judged`, `skip_updated`, `round_ended`, `game_won`, `game_error`, `left_room`

---

## โครงสร้างโปรเจกต์

```
shared/
  types.ts · words.ts        Match Word: สถานะ/อีเวนต์, normalize, strict match, ตรวจคำซ้ำ
  character.ts               MatchCharacter: ตั้งค่า, หมวดหมู่, สถานะ/อีเวนต์, ตรวจใบ้/คำตอบ/ตัวละครซ้ำ
server/src/
  index.ts · app.ts          entry · Express (+ /api/rooms/:code) + ผูกสองเกมเข้ากับ Socket.IO
  core/seatedRoom.ts         ระบบที่นั่งที่ทั้งสองเกมใช้ร่วมกัน (เข้าห้อง, session, reconnect 60 วิ, ย้าย Host)
  core/wire.ts               handler กลาง: create / join / restore / leave / disconnect
  games/word/                room.ts (กติกา + timer) · register.ts (อีเวนต์)
  games/character/           room.ts (ใบ้ → แข่งตอบ → ตัดสิน, นาฬิกาที่หยุด/เดินต่อได้) · register.ts
                             images.ts (ค้นรูปจาก AniList / Wikipedia + cache, timeout, rate-limit)
server/test/                 words · game (Match Word) · character (MatchCharacter) — เล่นเกมจริงผ่าน socket
                             images (ค้นรูปด้วย API จำลอง — test ไม่ต่ออินเทอร์เน็ต)
client/src/
  App.tsx                    เลือกหน้าจอ: picker / word / character
  picker/                    GamePicker (หน้าแรก) · BackToPicker
  lib/                       nav (หน้าจอ + URL) · toast · sound (Web Audio) · storage · invite · store/socket ของ Match Word
  pages/ · components/       หน้าจอและ UI ของ Match Word (+ ชิ้นส่วน UI ที่ใช้ร่วมกัน)
  character/                 store · socket · parts (Scoreboard, TimerBar, Clue, Buzz overlay, CharPortrait, pickers…) · pages/
```
