# PROJECT: พิมพ์จนกว่าคำจะตรงกัน

English Name: Type Until We Match

## 1. Project Overview

พัฒนา Web Application เกม "พิมพ์จนกว่าคำจะตรงกัน"
สำหรับผู้เล่น 2 คน ผ่านระบบ Multiplayer Real-time

แนวคิดของเกม:
ผู้เล่นทั้งสองคนต้องคิดคำที่เชื่อมโยงกันจากคำตั้งต้น
และพยายามพิมพ์คำตอบให้ตรงกัน โดยไม่เห็นคำตอบของอีกฝ่ายก่อน

เล่นต่อเนื่องไปเรื่อย ๆ จนกว่าทั้งสองคนจะพิมพ์คำเดียวกัน

เป้าหมายคือสร้างเกมที่เล่นได้จริงผ่าน Browser
โดยผู้เล่นสามารถใช้มือถือหรือคอมพิวเตอร์คนละเครื่องได้

นี่เป็น MVP ไม่ต้องสร้างระบบที่ซับซ้อนเกินความจำเป็น

---

## 2. Technology Stack

ใช้เทคโนโลยีดังนี้

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS

Backend:

- Node.js
- Express
- Socket.IO

Storage:

- ไม่ต้องใช้ Database
- ไม่ต้องใช้ PostgreSQL
- ไม่ต้องใช้ MongoDB
- ไม่ต้องใช้ Prisma
- เก็บข้อมูลห้องและสถานะเกมไว้ใน Server Memory
- เมื่อ Server Restart ข้อมูลเกมสามารถหายได้

Deployment:

- Frontend และ Backend สามารถรันแยกกันได้
- รองรับ Local Development
- เตรียมให้ Deploy บน Hosting ที่รองรับ Node.js ได้

---

## 3. Game Rules

### 3.1 จำนวนผู้เล่น

- หนึ่งห้องมีผู้เล่นได้สูงสุด 2 คน
- คนสร้างห้องเป็น Player A (Host)
- คนเข้าร่วมห้องเป็น Player B (Guest)
- ผู้เล่นคนที่ 3 ไม่สามารถเข้าห้องที่เต็มแล้วได้

### 3.2 การเริ่มเกม

เมื่อมีผู้เล่นครบ 2 คน Host สามารถกด Start Game ได้

ผู้เล่นทั้งสองต้องพิมพ์คำแรกของตัวเองคนละ 1 คำ

ตัวอย่าง:

- Player A: กาแฟ
- Player B: โรงเรียน

ห้ามเห็นคำตอบของอีกฝ่ายก่อนทั้งสองคนส่งคำตอบ

เมื่อทั้งสองคนส่งแล้ว:

1. Countdown 3-2-1
2. เปิดเผยคำตอบพร้อมกัน
3. นำคำทั้งสองไปเป็นโจทย์สำหรับรอบถัดไป

### 3.3 การเล่นในแต่ละรอบ

หลังจากเห็นคำตั้งต้นทั้งสองคำแล้ว:

1. Player A และ Player B คิดคำเชื่อมโยงจากคำทั้งสอง
2. พิมพ์คำตอบลงใน Input
3. กด Ready
4. แสดงสถานะว่าใคร Ready แล้ว
5. เมื่อทั้งสองคน Ready ให้ Countdown 3-2-1
6. เปิดเผยคำตอบพร้อมกัน

หากคำตอบไม่ตรงกัน:

- นำคำตอบของ Player A และ Player B มาเป็นโจทย์ใหม่
- เพิ่มเลขรอบ
- เริ่มรอบใหม่ทันที

หากคำตอบตรงกัน:

- จบเกม
- แสดงหน้าชนะ

### 3.4 Strict Matching

ใช้ Strict Matching เท่านั้น

ตัวอย่าง:

กาแฟ = กาแฟ : MATCH
กาแฟ != กาแฟดำ : NOT MATCH
ไอติม != ไอศกรีม : NOT MATCH
Apple != apple : NOT MATCH

เงื่อนไข:

- ตัดช่องว่างหัวท้าย
- ใช้ Unicode NFC Normalization
- รักษาตัวพิมพ์เล็กและใหญ่
- ไม่ใช้ AI เปรียบเทียบความหมาย
- ไม่ใช้คำพ้องความหมาย
- ไม่ใช้ Fuzzy Matching
- ต้องเป็นข้อความเดียวกันเท่านั้น

### 3.5 Duplicate Word Rule

ห้ามผู้เล่นใช้คำที่ตัวเองเคยส่งไปแล้วในเกมเดียวกัน

- ตรวจสอบคำซ้ำแยกตามผู้เล่น
- คำที่อีกฝ่ายเคยใช้สามารถนำมาใช้ได้
- เก็บประวัติคำใน Memory ของ Server
- หากคำซ้ำให้แจ้งเตือนและไม่อนุญาตให้ Ready

### 3.6 Timer

ค่าเริ่มต้น 30 วินาทีต่อรอบ

ให้ Host สามารถเลือกได้:

- 15 วินาที
- 20 วินาที
- 30 วินาที
- 45 วินาที
- 60 วินาที

เมื่อหมดเวลา:

- ไม่เปิดเผยคำตอบ
- ไม่เปลี่ยนคำตั้งต้น
- ไม่เพิ่มเลขรอบ
- Reset คำตอบของทั้งสองคน
- Reset Ready Status
- เริ่มรอบเดิมใหม่ทันที
- เริ่ม Timer ใหม่

แจ้งข้อความ:
"หมดเวลา! เริ่มรอบเดิมใหม่"

หากทั้งสอง Ready ก่อนหมดเวลา ให้หยุด Timer และเริ่ม Countdown ทันที

---

## 4. Application Pages

### 4.1 Home Page

แสดง:

- ชื่อเกม
- คำอธิบายเกม
- ปุ่ม Create Room
- ปุ่ม Join Room
- ช่องกรอกชื่อผู้เล่น

### 4.2 Create Room

- กรอกชื่อผู้เล่น
- เลือกเวลาต่อรอบ
- กด Create Room
- สร้าง Room Code แบบสุ่ม 6 ตัว
- แสดง Invite Link
- ปุ่ม Copy Link
- รอผู้เล่นอีกคนเข้าร่วม

### 4.3 Join Room

- กรอก Room Code
- กรอกชื่อผู้เล่น
- รองรับการเข้าผ่าน Invite Link
- แจ้งเตือนหากห้องไม่มีอยู่หรือเต็มแล้ว

### 4.4 Lobby

แสดง:

- Room Code
- ผู้เล่น A
- ผู้เล่น B
- สถานะ Connected
- กติกาเกม
- Timer Setting
- ปุ่ม Start Game สำหรับ Host

### 4.5 Game Screen

ออกแบบให้เป็นหน้าจอหลักที่ใช้งานง่าย

แสดง:

- ชื่อเกม
- Room Code
- Round Number
- Player A และ Player B
- คำตั้งต้นของทั้งสองฝ่าย
- Timer Countdown
- Input สำหรับพิมพ์คำตอบ
- ปุ่ม Ready
- สถานะ Ready ของผู้เล่นทั้งสอง
- ประวัติคำตอบย้อนหลัง

ข้อสำคัญ:

- ห้ามแสดงคำตอบของอีกฝ่ายก่อน Reveal
- เมื่อกด Ready แล้วต้องไม่สามารถแก้ไขคำตอบได้
- แสดงสถานะกำลังรออีกฝ่าย

### 4.6 Reveal Screen

เมื่อทั้งสอง Ready:

- Countdown 3-2-1
- เปิดเผยคำตอบทั้งสองพร้อมกัน
- แสดง MATCH หรือ NOT MATCH

หากไม่ตรงกัน:

- แสดงข้อความ "ยังไม่ตรงกัน ลองอีกครั้ง!"
- เปลี่ยนคำตั้งต้นเป็นคำตอบล่าสุด
- เพิ่มเลขรอบ
- เริ่มรอบใหม่

หากตรงกัน:

- แสดง Animation ฉลอง
- แสดงข้อความ "เราคิดตรงกันแล้ว!"
- แสดงคำที่ตรงกัน
- แสดงจำนวนรอบที่ใช้

### 4.7 Victory Screen

แสดง:

- ข้อความแสดงความยินดี
- คำที่ตรงกัน
- จำนวนรอบ
- ปุ่ม Play Again
- ปุ่ม Return to Home

---

## 5. Real-time Communication

ใช้ Socket.IO สำหรับการสื่อสารระหว่างผู้เล่น

Client Events:

- create_room
- join_room
- start_game
- submit_initial_word
- submit_answer
- player_ready
- leave_room
- request_rematch

Server Events:

- room_created
- room_joined
- player_joined
- player_left
- room_updated
- game_started
- initial_words_revealed
- round_started
- player_ready_updated
- countdown_started
- reveal_answers
- round_result
- round_timeout
- game_won
- game_error

ข้อกำหนด:

- Server เป็นผู้ควบคุมสถานะเกม
- Server เป็นผู้ควบคุม Timer
- Server เป็นผู้ตรวจสอบคำตอบ
- Server เป็นผู้ตัดสินผลการแข่งขัน
- ห้าม Client ตัดสินผลเกมเอง
- ห้ามส่งคำตอบส่วนตัวให้อีกฝ่ายก่อน Reveal

---

## 6. Game State

ใช้ Game State แบบง่าย โดยมีสถานะดังนี้:

- WAITING_FOR_PLAYERS
- LOBBY
- INITIAL_INPUT
- ROUND_INPUT
- WAITING_FOR_READY
- COUNTDOWN
- REVEAL
- GAME_OVER

จัดการ State Transition ผ่าน Backend

ไม่จำเป็นต้องสร้าง State Machine Framework ที่ซับซ้อน

---

## 7. Server Memory Structure

ใช้ JavaScript Map หรือโครงสร้างข้อมูลที่เหมาะสม

ตัวอย่าง:

Room:

- roomCode
- hostPlayer
- guestPlayer
- timerSeconds
- gameState
- currentRound
- currentWords
- playerAnswers
- readyPlayers
- usedWords
- roundHistory
- timerDeadline

Player:

- playerId
- socketId
- playerName
- role
- connected

Game:

- currentRound
- playerAWord
- playerBWord
- playerAAnswer
- playerBAnswer
- readyStatus
- roundHistory

ข้อมูลทั้งหมดเก็บไว้ใน Memory ของ Server

ไม่ต้องทำระบบ User Authentication
ไม่ต้องทำระบบสมัครสมาชิก
ไม่ต้องทำระบบเก็บประวัติข้ามเกม
ไม่ต้องทำระบบ Leaderboard

---

## 8. UI / UX Design

แนวทางการออกแบบ:

Modern Casual Game
Minimal
Clean
Playful
Friendly

สีหลัก:

- Purple
- Indigo
- Blue
- White

ใช้:

- Rounded Cards
- Soft Shadows
- Gradient Background
- Smooth Animation
- Large Buttons
- Readable Typography

ฟอนต์:

- Prompt
- Noto Sans Thai

Responsive Design:

- Mobile First
- Tablet
- Desktop

หน้าจอมือถือควรใช้งานง่ายโดยไม่ต้อง Zoom

Animation:

- Countdown 3-2-1
- Reveal Answer
- Match Celebration
- Timeout Notification

Sound Effect:

- Countdown
- Match
- Timeout

สามารถปิดเสียงได้

---

## 9. Error Handling

รองรับกรณี:

- Room Not Found
- Room Full
- Invalid Room Code
- Player Disconnected
- Opponent Disconnected
- Duplicate Word
- Empty Answer
- Game Already Started
- Unauthorized Action

หากผู้เล่นหลุด:

- แจ้งอีกฝ่าย
- ให้กลับเข้าห้องเดิมได้ภายใน 60 วินาที
- Restore สถานะเกมจาก Server Memory
- หากไม่กลับมา ให้แจ้งว่าอีกฝ่ายออกจากเกมแล้ว

---

## 10. Project Structure

ออกแบบเองได้เลย 

สามารถปรับโครงสร้างได้ตามความเหมาะสม แต่ต้องแยก Frontend และ Backend ให้ชัดเจน

---

## 11. Development Workflow

พัฒนาเป็นลำดับดังนี้:

Phase 1:

- Setup Project
- Setup React
- Setup Express
- Setup Socket.IO
- สร้างระบบ Create Room / Join Room

Phase 2:

- Implement Game Logic
- Implement Initial Word
- Implement Round System
- Implement Strict Matching
- Implement Duplicate Word Rule
- Implement Timer
- Implement Ready / Countdown

Phase 3:

- Develop UI ทุกหน้าจอ
- Responsive Design
- Animation
- Integrate Frontend กับ Backend

Phase 4:

- Test ด้วย Browser 2 หน้าต่าง
- ทดสอบมือถือ 2 เครื่อง
- ทดสอบ Timeout
- ทดสอบคำซ้ำ
- ทดสอบคำตรงกัน
- ทดสอบ Disconnect / Reconnect

---

## 12. Acceptance Criteria

ถือว่า MVP เสร็จเมื่อ:

1. ผู้เล่น 2 คนเปิดเว็บจากอุปกรณ์คนละเครื่องได้
2. สร้างห้องและเข้าร่วมห้องได้
3. ผู้เล่นคนที่ 3 เข้าห้องไม่ได้
4. ส่งคำเริ่มต้นแบบส่วนตัวได้
5. พิมพ์คำตอบพร้อมกันได้
6. ไม่เห็นคำตอบของอีกฝ่ายก่อน Reveal
7. Ready Status แสดงแบบ Real-time
8. Countdown ทำงานพร้อมกัน
9. Strict Matching ทำงานถูกต้อง
10. คำพ้องความหมายไม่นับว่าตรง
11. ป้องกันคำซ้ำของตัวเองได้
12. หมดเวลาแล้วเริ่มรอบเดิมใหม่
13. ไม่เพิ่มเลขรอบเมื่อ Timeout
14. คำตอบตรงกันแล้วจบเกม
15. เล่นใหม่ได้
16. รองรับ Mobile และ Desktop

---

## 13. Final Instructions

สิ่งที่ต้องการคือ MVP ที่ใช้งานได้จริง

ไม่ต้องสร้างระบบที่เกินความจำเป็น

ห้ามเพิ่ม:

- Database
- User Authentication
- ระบบสมัครสมาชิก
- ระบบ Subscription
- ระบบ Payment
- Leaderboard
- ระบบเก็บสถิติถาวร
- ระบบ AI วิเคราะห์คำ
- ระบบ Chat ระหว่างผู้เล่น

ให้เน้นการพัฒนา:

1. ระบบสร้างห้องและเข้าห้อง
2. ระบบเล่น 2 คนแบบ Real-time
3. ระบบพิมพ์คำตอบแบบ Private
4. ระบบ Ready และ Countdown
5. ระบบตรวจสอบคำตรงกัน
6. ระบบ Timer และ Timeout
7. UI ที่สวยงามและ Responsive

เริ่มต้นด้วยการ Setup Project และสร้างระบบให้ผู้เล่น 2 คนสามารถเชื่อมต่อกันได้ก่อน จากนั้นจึงพัฒนา Game Logic และ UI ตามลำดับ

ห้ามสร้างเพียง UI Mockup ต้องสามารถเล่นเกมได้จริงผ่าน Browser สองเครื่อง