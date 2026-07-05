# Answer Race Bot

บอท Discord สำหรับตั้งคำถามแล้วจับคนที่ตอบถูกคนแรก

## คำสั่ง

- `/quiz ask question:<คำถาม> answer:<คำตอบ>`
- `/quiz stop`
- `/quiz status`

ตัวอย่าง:

```text
/quiz ask question:1+1 = ? answer:2 seconds:60
```

รองรับหลายคำตอบด้วย `|`:

```text
/quiz ask question:เมืองหลวงไทยคืออะไร answer:กรุงเทพ|กรุงเทพฯ|bangkok
```

## ติดตั้ง

```bash
npm install
cp .env.example .env
nano .env
npm run deploy
npm start
```

ใน Discord Developer Portal ต้องเปิด:

- Server Members Intent ไม่จำเป็น
- Message Content Intent จำเป็น เพราะบอทต้องอ่านข้อความเพื่อตรวจคำตอบ

## ตัวแปร .env

```env
DISCORD_TOKEN=token ของบอท
CLIENT_ID=application/client id
GUILD_ID=server id ถ้าต้องการให้คำสั่งขึ้นทันที
```

ถ้าไม่ใส่ `GUILD_ID` คำสั่งจะเป็น global และอาจใช้เวลาสักพักกว่าจะขึ้น
