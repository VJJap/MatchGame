# พิมพ์จนกว่าคำจะตรงกัน · Type Until We Match

เกมเชื่อมคำสำหรับ 2 ผู้เล่นแบบ Real-time ผ่าน Browser — ต่างคนต่างพิมพ์คำแล้วเปิดพร้อมกัน
หาคำที่อยู่ “ตรงกลาง” ระหว่างสองคำล่าสุดไปเรื่อย ๆ จนกว่าทั้งคู่จะพิมพ์คำเดียวกัน

ออกแบบให้เล่นบน **มือถือ, iPad (แนวตั้ง/แนวนอน) และ Laptop** เป็นหลัก

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4 (`client/`)
- **Backend:** Node.js + Express + Socket.IO (`server/`)
- **Shared:** ชนิดข้อมูล, event และกฎตรวจคำที่ใช้ร่วมกัน (`shared/`)
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

- เปิด `http://localhost:5173` บนเครื่องนี้
- **เล่นกับมือถือ / iPad:** ให้อุปกรณ์ต่อ Wi-Fi เดียวกับคอมพิวเตอร์ แล้วเปิด URL `Network` ที่ Vite แสดง (เช่น `http://192.168.1.20:5173`)
  ลิงก์เชิญในหน้า Lobby จะเปลี่ยนเป็น IP ในวง Wi-Fi ให้อัตโนมัติ ส่งให้เพื่อนเปิดได้เลย
- **ทดสอบคนเดียวบนเครื่องเดียว:** เปิด 2 แท็บ — แต่ละแท็บเป็นผู้เล่นคนละคน (session เก็บแยกต่อแท็บ)

`npm run dev` จะรัน 2 process พร้อมกัน: Socket.IO server ที่พอร์ต `3001` และ Vite ที่พอร์ต `5173` (Vite proxy `/socket.io` ไปที่ server)

## คำสั่งอื่น ๆ

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm test` | รัน unit + integration tests ของ server (เล่นเกมจริงผ่าน Socket.IO, จับเวลาแบบย่อ) |
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

> ข้อควรรู้: ห้องทั้งหมดอยู่ใน Memory ของ process เดียว จึงควรรัน Server แค่ 1 instance

---

## กติกาที่ระบบบังคับใช้

- ห้องละ 2 คน: คนสร้างห้อง = Player A (Host), คนเข้าร่วม = Player B · คนที่ 3 เข้าไม่ได้
- **รอบเปิด (คำเริ่มต้น):** ทั้งคู่พิมพ์คำอะไรก็ได้ แล้วกด Ready → เมื่อ Ready ครบนับ 3-2-1 → เปิดคำพร้อมกัน
- **รอบเชื่อมคำ:** นำคำล่าสุดของทั้งคู่เป็นโจทย์ → พิมพ์คำเชื่อม → Ready → 3-2-1 → เปิดคำ
  ไม่ตรง = คำล่าสุดกลายเป็นโจทย์ใหม่และเพิ่มเลขรอบ · ตรง = จบเกม
- **Strict Matching:** ตัดช่องว่างหัวท้าย + Unicode NFC, ตัวพิมพ์เล็ก/ใหญ่ต่างกันนับว่าไม่ตรง
  (`ไอติม` ≠ `ไอศกรีม`, `Apple` ≠ `apple`, `กาแฟ` ≠ `กาแฟดำ`) — ไม่มี AI / คำพ้อง / fuzzy
- **ห้ามคำซ้ำของตัวเอง:** ตรวจแยกรายผู้เล่น คำที่อีกฝ่ายเคยใช้ยังใช้ได้ (เตือนทันทีขณะพิมพ์ และ Server ตรวจซ้ำอีกชั้น)
- **Timer:** Host เลือก 15/20/30/45/60 วินาที (ค่าเริ่มต้น 30) ตอนสร้างห้องหรือใน Lobby
  หมดเวลา → ไม่เปิดคำ, ไม่เปลี่ยนโจทย์, ไม่เพิ่มรอบ, ล้างคำตอบและ Ready แล้วเริ่มรอบเดิมใหม่ (“หมดเวลา! เริ่มรอบเดิมใหม่”)
- กด Ready แล้วแก้คำตอบไม่ได้ · คำตอบของอีกฝ่ายไม่ถูกส่งมาที่เครื่องเราจนกว่าจะ Reveal
- **หลุดการเชื่อมต่อ:** ที่นั่งถูกเก็บไว้ 60 วินาที (เวลาของรอบหยุดชั่วคราว) — รีเฟรช/เปิดลิงก์เดิมในแท็บเดิมเพื่อกลับเข้าห้อง
  ถ้าไม่กลับมา อีกฝ่ายจะได้รับแจ้งว่าออกจากเกม และกลายเป็น Host ของห้องที่รอผู้เล่นใหม่
- **เล่นใหม่:** ทั้งคู่ต้องกด “เล่นอีกครั้ง” แล้วจะกลับไปที่ Lobby (ประวัติคำ/คำที่ใช้แล้วเริ่มใหม่)

Server เป็นผู้ควบคุมสถานะเกม, Timer, การตรวจคำ และตัดสินผลทั้งหมด

## โครงสร้างโปรเจกต์

```
shared/          types.ts (สถานะ/อีเวนต์) · words.ts (normalize, strict match, ตรวจคำซ้ำ)
server/src/      index.ts (entry) · app.ts (Express + Socket.IO handlers) · room.ts (game logic + timers) · config.ts
server/test/     words.test.ts · game.test.ts (เล่นเกมจริงผ่าน socket) · helpers.ts
client/src/
  lib/           store.ts (รับ event จาก socket → state) · socket.ts · sound.ts (Web Audio) · storage.ts · invite.ts
  pages/         Home · Lobby · Game · Victory
  components/    game-parts (Timer, Prompt, Countdown, Reveal, History) · chrome (TopBar, Toasts, banners) · ui · icons
```

**Game states:** `WAITING_FOR_PLAYERS → LOBBY → INITIAL_INPUT → (WAITING_FOR_READY) → COUNTDOWN → REVEAL → ROUND_INPUT → … → GAME_OVER`

**Client → Server:** `create_room`, `join_room` (รวมการกลับเข้าห้องด้วย `playerId` + `token`), `update_settings`, `start_game`,
`submit_initial_word`, `submit_answer`, `player_ready`, `leave_room`, `request_rematch`

**Server → Client:** `room_created`, `room_joined`, `player_joined`, `player_left`, `room_updated` (snapshot เฉพาะของผู้เล่นแต่ละคน),
`game_started`, `initial_words_revealed`, `round_started`, `player_ready_updated`, `countdown_started`, `reveal_answers`,
`round_result`, `round_timeout`, `game_won`, `game_error`, `left_room`
# MatchGame
