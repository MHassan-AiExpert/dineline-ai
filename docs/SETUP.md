# DineLine AI setup guide

Each step is independent: the app works after step 1, and every later step switches one more part from demo mode to live. Commands work in PowerShell, Command Prompt, macOS and Linux.

## 1. Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
copy .env.example .env.local      # macOS/Linux: cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. You'll see a week of demo history for Saffron Grill. **Talk to the crew** opens the chatbot; orders and bookings you make there appear on the kitchen board and reservation book right away.

Use **Setup → Reset demo data** to start fresh at any time.

## 2. Give the agents an AI brain (free)

1. Create a key at https://aistudio.google.com/app/apikey.
2. In `.env.local`:

   ```env
   LLM_PROVIDER=gemini
   LLM_API_KEY=your-gemini-key
   LLM_MODEL=gemini-3.8-flash
   ```

3. Restart `npm run dev`. The sidebar now shows "gemini · gemini-3.8-flash" as the agent brain.

OpenAI (`gpt-4o-mini`), Groq (`llama-3.3-70b-versatile`) and OpenRouter work the same way; change `LLM_PROVIDER` and `LLM_MODEL`. If the provider fails, the chat falls back to the built-in crew and shows a notice.

Check it from the terminal with `npm run test:crew`.

## 3. Supabase (production database)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, paste and run `supabase/schema.sql`, then `supabase/seed.sql`.
3. From **Project Settings → API**, copy the Project URL and the `service_role` key into `.env.local`:

   ```env
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```

4. Load a week of demo history: `npm run seed:supabase`.
5. Restart the app. The sidebar shows "Supabase" under Data.

The service role key stays on the server; row level security is enabled with no public policies.

## 4. A public URL

Vapi and n8n need to reach the app over HTTPS.

- **Local:** `ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`) and copy the https URL.
- **Production:** deploy to Vercel and add the same variables from `.env.local` in the project settings.

```env
PUBLIC_APP_URL=https://your-url.ngrok-free.app
DINELINE_WEBHOOK_SECRET=pick-a-long-random-string
```

## 5. Vapi voice crew

1. Sign up at https://vapi.ai and copy your **private** and **public** API keys.
2. Optionally buy or import a phone number (a free Vapi number or your Twilio number) and copy its ID.
3. In `.env.local`:

   ```env
   VAPI_PRIVATE_KEY=...
   VAPI_PHONE_NUMBER_ID=...                 # optional
   TRANSFER_PHONE_NUMBER=+1XXXXXXXXXX       # optional: real staff number for live transfers
   ```

4. Run `npm run setup:vapi`. It creates the 15 function tools, the four assistants (Receptionist, Order, Reservation, FAQ) and the **DineLine Restaurant Crew** squad, attaches the squad to your number if you set one, and prints the squad ID.
5. For the in-browser call button, add:

   ```env
   NEXT_PUBLIC_VAPI_PUBLIC_KEY=...
   NEXT_PUBLIC_VAPI_SQUAD_ID=the-printed-squad-id
   ```

6. Restart the app. **Talk to the crew → Call by voice** now starts a real voice call, and calls to your number reach the squad.

Re-run `npm run setup:vapi` whenever you change prompts or tools; it updates the existing assistants instead of creating duplicates.

## 6. Customer texts (Twilio)

On a Twilio trial you can only text numbers you've verified in the Twilio console, and messages start with a trial notice.

Option A, through n8n (recommended): import workflow 04 (step 7) and set

```env
N8N_NOTIFY_WEBHOOK_URL=https://your-n8n/webhook/dineline-notify
```

Option B, straight from the app:

```env
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
TWILIO_CHANNEL=sms                 # or whatsapp (uses the Twilio WhatsApp sandbox)
```

Until one of these is set, every text is recorded in **Setup → Text outbox** and in the chatbot's "Texts sent to the caller" panel.

## 7. n8n workflows

1. Start n8n (`npx n8n` or your existing install) and open it.
2. For each file in `n8n/`: **Workflows → Import from File**.
3. Open the **Config** node in each workflow and set `appUrl` (your public URL), `secret` (same as `DINELINE_WEBHOOK_SECRET`) and, where present, `twilioFrom` / `ownerPhone`.
4. On every Twilio node, choose or create your Twilio credential.
5. Activate the workflows.

To send the voice tools through n8n instead of straight to the app, copy the production webhook URLs of workflows 01, 02 and 03 into `.env.local` and re-run `npm run setup:vapi`:

```env
VAPI_TOOLS_URL_LOOKUP=https://your-n8n/webhook/dineline-lookup
VAPI_TOOLS_URL_ORDERS=https://your-n8n/webhook/dineline-orders
VAPI_TOOLS_URL_RESERVATIONS=https://your-n8n/webhook/dineline-reservations
VAPI_EVENTS_URL=https://your-n8n/webhook/dineline-vapi-events
```

## 8. Make it yours

Restaurant name, address, hours, tax, delivery zone and fees live in `lib/seed.ts` (`DEFAULT_SETTINGS`), and the menu and tables are in the same file. With Supabase, edit the `settings` row and `menu_items` table instead, or regenerate `supabase/seed.sql` with `npm run seed:sql`.

Agent personalities and rules are in `lib/agents/definitions.ts`. After editing, run `npm run export:vapi` and `npm run setup:vapi` to update the phone crew.
