# Talkie Town - Real-Time Chat Application

This project uses:
- Frontend: React (Vite)
- Backend: Node.js + Express + Socket.IO + JWT
- Database: PostgreSQL + Prisma ORM
- Auth: Google OAuth (ID Token verification)

## Project Structure

- `frontend/` - Chat UI
- `backend/` - REST API, real-time server, Prisma/PostgreSQL models

## Features Implemented

- Google login
- Automatic user profile creation (unique username generation)
- Add friend by username
- Incoming friend requests (accept/reject)
- One-to-one conversation created when request is accepted
- Conversation list with previous chats
- Send and receive direct messages
- Delete for me (hides message for current user)
- Delete for everyone (sender only)
- Pin and unpin messages
- Real-time updates using Socket.IO
- Input validation and persistence through PostgreSQL

## Backend Setup

1. Go to backend folder:
   - `cd backend`
2. Create `.env` from `.env.example` and set:
   - `DATABASE_URL`
   - `GOOGLE_CLIENT_ID`
   - `JWT_SECRET`
   - `CLIENT_ORIGIN`
3. Initialize schema:
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
4. Run server:
   - Development: `npm run dev`
   - Production: `npm start`

### Quick No-DB Mode

If you want to run all chat features without setting up PostgreSQL yet, set this in `backend/.env`:

- `USE_IN_MEMORY_STORE=true`

This enables login, friend requests, chats, pin/delete, and realtime messaging with in-memory data.

Backend runs on `http://localhost:5000` by default.

## Frontend Setup

1. Go to frontend folder:
   - `cd frontend`
2. Create `.env` from `.env.example` and set:
   - `VITE_API_URL`
   - `VITE_SOCKET_URL`
   - `VITE_GOOGLE_CLIENT_ID`
3. Run app:
   - `npm run dev`

Frontend runs on `http://localhost:5173` by default.

## API Endpoints

- `GET /api/health`
- `POST /api/auth/google`
- `GET /api/users/me`
- `PATCH /api/users/me/username`
- `GET /api/users/search?username=<prefix>`
- `POST /api/friend-requests`
- `GET /api/friend-requests/incoming`
- `PATCH /api/friend-requests/:id`
- `GET /api/friends`
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `PATCH /api/messages/:id/delete-for-me`
- `PATCH /api/messages/:id/delete-for-everyone`
- `PATCH /api/messages/:id/pin`

All protected endpoints require header:
- `Authorization: Bearer <jwt>`
