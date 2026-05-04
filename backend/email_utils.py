import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv

load_dotenv()

APP_URL = os.getenv("APP_URL", "http://localhost:5174")


def send_reset_email(to_email: str, token: str):
    reset_link = f"{APP_URL}/reset-password?token={token}"

    smtp_host = os.getenv("SMTP_HOST")
    if not smtp_host:
        print(f"\n[Password Reset] Link for {to_email}:\n  {reset_link}\n")
        return

    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    body = f"""Hi,

You requested a password reset for your Finance OS account.

Click the link below to set a new password (expires in 1 hour):

{reset_link}

If you didn't request this, you can ignore this email.
"""
    msg = MIMEText(body)
    msg["Subject"] = "Finance OS — Reset your password"
    msg["From"] = smtp_from
    msg["To"] = to_email

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_from, [to_email], msg.as_string())
