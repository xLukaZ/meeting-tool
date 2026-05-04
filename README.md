# 360 Vista Meeting-System

Internes Meeting-Booking-System mit oeffentlicher Buchungsseite, einem zentralen Admin, Google Calendar/Meet pro Mitarbeiter, globalem HubSpot Sync und SMTP-Versand pro Mitarbeiter.

## Server

Die App laeuft fuer den ersten VPS-Test auf:

```bash
http://SERVER_IP:6666
```

## ENV

`.env` enthaelt nur Basis-Secrets:

```bash
DATABASE_URL="postgresql://meetingtool:meetingtool@localhost:5432/meetingtool"
APP_URL="http://SERVER_IP:6666"
PORT=6666
SESSION_SECRET="replace-with-a-random-session-secret-min-32-chars"
TOKEN_ENCRYPTION_KEY="exactly-32-characters-long-key!!"
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"
GOOGLE_REDIRECT_URI="http://SERVER_IP:6666/api/team/callback"
```

HubSpot Token und SMTP-Passwoerter werden verschluesselt in der Datenbank gespeichert, nicht in `.env`.

HubSpot Private App Scopes:

```bash
crm.objects.contacts.read
crm.objects.contacts.write
crm.objects.owners.read
crm.objects.appointments.read
crm.objects.appointments.write
```

## Setup

```bash
npm install
npx prisma generate
npm run db:push
npm run build
npm start
```

## Google OAuth

In der Google Cloud Console muss diese Redirect URI eingetragen sein:

```bash
http://SERVER_IP:6666/api/team/callback
```

Es gibt zwei getrennte OAuth-Aktionen ueber denselben Callback:

- `admin_login`: erster Google Login im Adminbereich wird als einziger Admin gespeichert.
- `connect_employee`: Admin verbindet den Kalender eines Mitarbeiters.

Die OAuth URL nutzt `access_type=offline` und `prompt=consent`, damit Google Refresh Tokens liefert.

## Admin Flow

1. `/admin` oeffnen.
2. Wenn noch kein Admin existiert, wird der erste erfolgreiche Google Login als Admin gespeichert.
3. Danach darf nur dieser Google Account das Dashboard nutzen.
4. Mitarbeiter anlegen.
5. Pro Mitarbeiter SMTP, Arbeitszeiten, Meetingdauer, Buffer, ICS-Text und Mailvorlagen pflegen.
6. Pro Mitarbeiter Kalender verbinden.
7. In `Einstellungen` den HubSpot Private-App Token speichern.

## Reminder Cron

Der Cron-Endpunkt ist:

```bash
GET /api/cron/reminders
```

Fuer Server-Cronjobs den Header setzen:

```bash
x-cron-secret: <SESSION_SECRET>
```
