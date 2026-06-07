import dotenv from "dotenv";
dotenv.config();

import { sendOtpMail } from "./helper/mail.helper";

async function run() {
  await sendOtpMail(
    "buiquynh497@gmail.com",
    "123456",
  );

  console.log("Send mail success");
}

run();