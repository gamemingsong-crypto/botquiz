# Pork Hyun Quiz

บอท Discord สำหรับตั้งคำถามและหาคนที่ตอบถูกเป็นคนแรก ผู้ชนะจะได้รับ 1 คะแนนต่อข้อ พร้อมตารางคะแนนและระบบกำหนดคะแนนเป้าหมาย

## การทำงาน

1. ผู้ดูแลเริ่มคำถามด้วย `/quiz ask`
2. บอทส่งการ์ด `คำถาม มหาสนุก` และแท็ก `@everyone`
3. คำตอบจะถูกปิดไว้ ผู้เล่นต้องพิมพ์คำตอบลงในห้องเดียวกับคำถาม
4. เมื่อมีคนตอบถูกคนแรก บอทจะแก้ไขการ์ดเดิมเพื่อเปิดเผยคำตอบและเพิ่มคะแนนให้ผู้ชนะ 1 คะแนน
5. หากใช้ `/quiz stop` คำถามจะถูกยุติโดยไม่เปิดเผยคำตอบ

บอทไม่มีตัวจับเวลา คำถามจะเปิดอยู่จนกว่าจะมีคนตอบถูกหรือผู้ดูแลสั่งหยุด

## สิทธิ์การใช้งาน

ทุกคนในเซิร์ฟเวอร์สามารถ:

- พิมพ์ตอบคำถามในห้องที่มีคำถามเปิดอยู่
- ใช้ `/point`, `/points` หรือ `/quiz points` เพื่อดูคะแนน

ผู้ที่สามารถตั้งและจัดการคำถามได้:

- เจ้าของเซิร์ฟเวอร์ Discord
- ผู้ใช้ ID `1508699693486575707`
- ผู้ใช้ ID `1523229935555055637`
- สมาชิกที่มียศ ID ใด ID หนึ่งข้างต้น กรณี ID ที่กำหนดเป็น role ID
- สมาชิกที่มีสิทธิ์ Discord `Manage Server` หรือ `Manage Messages`

## คำสั่ง

### เริ่มคำถาม

```text
/quiz ask question:<คำถาม> answer:<คำตอบ>
```

ตัวอย่าง:

```text
/quiz ask question:1+1 เท่ากับเท่าไร answer:2
```

ตัวเลือกของ `/quiz ask`:

- `question` คำถามที่ต้องการถาม
- `answer` คำตอบที่ถูกต้อง
- `match:exact` ต้องตอบตรงกับคำตอบที่ตั้งไว้ ค่าเริ่มต้น
- `match:contains` ข้อความที่พิมพ์ต้องมีคำตอบอยู่ข้างใน
- `case_sensitive:true` แยกตัวอักษรพิมพ์เล็กและพิมพ์ใหญ่

กำหนดคำตอบที่ยอมรับได้หลายแบบโดยคั่นด้วย `|`:

```text
/quiz ask question:เมืองหลวงของไทยคืออะไร answer:กรุงเทพ|กรุงเทพฯ|bangkok
```

### หยุดและตรวจสอบคำถาม

```text
/quiz stop
/quiz status
```

- `/quiz stop` ยุติคำถามในห้องปัจจุบันโดยไม่เปิดคำตอบ
- `/quiz status` ตรวจว่าห้องปัจจุบันมีคำถามอะไรเปิดอยู่

### คะแนน

```text
/point
/points
/quiz points
```

- ไม่ระบุ `user` จะแสดงผู้เล่นทุกคนที่มีคะแนน เรียงจากมากไปน้อย
- ระบุ `user:@ชื่อ` จะแสดงคะแนนของผู้เล่นคนนั้น

ตัวอย่าง:

```text
/point user:@Pork Hyun
```

ล้างคะแนนทั้งหมดในเซิร์ฟเวอร์:

```text
/quiz clearpoints
```

เพิ่มคะแนนให้สมาชิก (เฉพาะเจ้าของเซิร์ฟเวอร์ แอดมิน และผู้ที่ได้รับอนุญาต):

```text
/quiz addpoints user:@Pork Hyun points:5
```

กำหนดคะแนนที่ต้องมีเพื่อให้บอทประกาศผู้ชนะ:

```text
/quiz winpoints points:5
```

ใช้ `points:0` เพื่อปิดการประกาศผู้ชนะตามคะแนนเป้าหมาย

## การติดตั้ง

ต้องใช้ Node.js 18 ขึ้นไป

```bash
npm install
cp .env.example .env
nano .env
npm run deploy
npm start
```

ตั้งค่า `.env`:

```env
DISCORD_TOKEN=token_of_your_bot
CLIENT_ID=discord_application_id
GUILD_ID=discord_server_id
SCORES_FILE=./scores.json
```

- `GUILD_ID` ทำให้ slash commands อัปเดตในเซิร์ฟเวอร์นั้นทันที
- หากไม่กำหนด `GUILD_ID` คำสั่งจะถูกลงทะเบียนแบบ global และอาจใช้เวลาระยะหนึ่งกว่าจะปรากฏ
- ห้ามนำไฟล์ `.env` หรือ token อัปโหลดขึ้น GitHub

ใน Discord Developer Portal ต้องเปิด `Message Content Intent` เพื่อให้บอทอ่านข้อความและตรวจคำตอบได้

## การรันด้วย PM2 บน VPS

เริ่มบอทครั้งแรก:

```bash
cd /home/Admin/answer-race-bot
npm install
npm run deploy
pm2 start index.js --name answerbot
pm2 save
```

อัปเดตบอทหลังมีโค้ดใหม่:

```bash
cd /home/Admin/answer-race-bot
git pull --ff-only origin main
npm install
node --check index.js
pm2 restart answerbot --update-env
pm2 save
```

ตรวจสถานะและ log:

```bash
pm2 status
pm2 logs answerbot --lines 50
```

## ข้อมูลคะแนน

คะแนนถูกเก็บใน `scores.json` และไม่ถูกเพิ่มเข้า Git ข้อมูลจึงไม่ถูกเขียนทับเมื่อ `git pull` แต่ควรสำรองไฟล์นี้ก่อนย้ายเครื่องหรือลบโฟลเดอร์บอท
