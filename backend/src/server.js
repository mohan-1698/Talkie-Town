require('dotenv').config();

const cors = require('cors');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const prisma = require('./lib/prisma');

const app = express();
const server = http.createServer(app);

const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const jwtSecret = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(googleClientId);

const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    methods: ['GET', 'POST', 'PATCH'],
  },
});

app.use(
  cors({
    origin: allowedOrigin,
  })
);
app.use(express.json());

function userRoom(userId) {
  return `user:${userId}`;
}

function conversationRoom(conversationId) {
  return `conversation:${conversationId}`;
}

function toPublicUser(user) {
  return {
    _id: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function toParticipantUser(user) {
  return {
    _id: user.id,
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
}

function makePairKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

async function generateUniqueUsername(seed) {
  const base = (seed || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18) || 'user';

  const baseExists = await prisma.user.findUnique({ where: { username: base } });
  if (!baseExists) {
    return base.slice(0, 24);
  }

  for (let i = 2; i < 500; i += 1) {
    const suffix = `_${i}`;
    const candidate = `${base.slice(0, 24 - suffix.length)}${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await prisma.user.findUnique({ where: { username: candidate } });
    if (!exists) {
      return candidate;
    }
  }

  return `${base.slice(0, 20)}_user`;
}

function parseBearerToken(req) {
  const authHeader = req.header('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7).trim();
}

function requireAuth(req, res, next) {
  try {
    const token = parseBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.sub;
    return next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function getConversationIfMember(conversationId, userId) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

  if (!conversation) {
    return null;
  }

  if (!conversation.participantIds.includes(String(userId))) {
    return null;
  }

  return conversation;
}

async function emitToConversationParticipants(conversation, eventName, payload) {
  for (const participantId of conversation.participantIds) {
    io.to(userRoom(participantId)).emit(eventName, payload);
  }
  io.to(conversationRoom(conversation.id)).emit(eventName, payload);
}

function serializeMessage(message) {
  return {
    _id: message.id,
    conversationId: message.conversationId,
    content: message.content,
    sender: message.sender ? toParticipantUser(message.sender) : null,
    isDeletedForEveryone: message.isDeletedForEveryone,
    isPinned: message.isPinned,
    pinnedBy: message.pinnedBy,
    pinnedAt: message.pinnedAt,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Unauthorized socket'));
    }

    const decoded = jwt.verify(token, jwtSecret);
    socket.userId = decoded.sub;
    return next();
  } catch (_error) {
    return next(new Error('Unauthorized socket'));
  }
});

io.on('connection', async (socket) => {
  socket.join(userRoom(socket.userId));

  socket.on('conversation:join', async (conversationId) => {
    const conversation = await getConversationIfMember(conversationId, socket.userId);
    if (conversation) {
      socket.join(conversationRoom(conversation.id));
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!googleClientId) {
      return res.status(500).json({ error: 'GOOGLE_CLIENT_ID is not configured on backend' });
    }

    const idToken = typeof req.body.idToken === 'string' ? req.body.idToken : '';
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.name) {
      return res.status(400).json({ error: 'Google token missing required profile fields' });
    }

    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          avatarUrl: payload.picture || null,
          username: await generateUniqueUsername(payload.email.split('@')[0]),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: payload.name,
          avatarUrl: payload.picture || user.avatarUrl,
        },
      });
    }

    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' });

    return res.json({ token, user: toPublicUser(user) });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

app.get('/api/users/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(toPublicUser(user));
});

app.patch('/api/users/me/username', requireAuth, async (req, res) => {
  const username = typeof req.body.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-24 chars: a-z, 0-9, _' });
  }

  const existing = await prisma.user.findFirst({
    where: {
      username,
      NOT: { id: req.userId },
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { username },
  });

  return res.json(toPublicUser(updated));
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const term = typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : '';
  if (term.length < 2) {
    return res.status(400).json({ error: 'Search term must be at least 2 characters' });
  }

  const users = await prisma.user.findMany({
    where: {
      NOT: { id: req.userId },
      username: { startsWith: term, mode: 'insensitive' },
    },
    select: { id: true, name: true, username: true, avatarUrl: true },
    take: 10,
  });

  return res.json(users.map(toParticipantUser));
});

app.post('/api/friend-requests', requireAuth, async (req, res) => {
  try {
    const toUsername = typeof req.body.toUsername === 'string' ? req.body.toUsername.trim().toLowerCase() : '';
    if (!toUsername) {
      return res.status(400).json({ error: 'toUsername is required' });
    }

    const fromUser = await prisma.user.findUnique({ where: { id: req.userId } });
    const toUser = await prisma.user.findUnique({ where: { username: toUsername } });

    if (!fromUser || !toUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (toUser.id === fromUser.id) {
      return res.status(400).json({ error: 'You cannot send a request to yourself' });
    }

    const accepted = await prisma.friendRequest.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { fromUserId: fromUser.id, toUserId: toUser.id },
          { fromUserId: toUser.id, toUserId: fromUser.id },
        ],
      },
    });

    if (accepted) {
      return res.status(409).json({ error: 'You are already friends' });
    }

    const reversePending = await prisma.friendRequest.findFirst({
      where: {
        fromUserId: toUser.id,
        toUserId: fromUser.id,
        status: 'pending',
      },
    });

    if (reversePending) {
      await prisma.friendRequest.update({
        where: { id: reversePending.id },
        data: { status: 'accepted' },
      });

      const pairKey = makePairKey(fromUser.id, toUser.id);
      const conversation = await prisma.conversation.upsert({
        where: { pairKey },
        update: {
          participantIds: [fromUser.id, toUser.id],
          lastMessageAt: new Date(),
        },
        create: {
          pairKey,
          participantIds: [fromUser.id, toUser.id],
          lastMessageAt: new Date(),
        },
      });

      io.to(userRoom(toUser.id)).emit('friend:accepted', {
        byUser: toPublicUser(fromUser),
        conversationId: conversation.id,
      });
      io.to(userRoom(fromUser.id)).emit('friend:accepted', {
        byUser: toPublicUser(toUser),
        conversationId: conversation.id,
      });

      return res.json({ message: 'Friend request auto-accepted from reverse pending request' });
    }

    const request = await prisma.friendRequest.upsert({
      where: {
        fromUserId_toUserId: {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
        },
      },
      update: {
        status: 'pending',
      },
      create: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        status: 'pending',
      },
    });

    io.to(userRoom(toUser.id)).emit('friend:request', {
      requestId: request.id,
      fromUser: toPublicUser(fromUser),
    });

    return res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    return res.status(500).json({ error: 'Failed to send friend request' });
  }
});

app.get('/api/friend-requests/incoming', requireAuth, async (req, res) => {
  const requests = await prisma.friendRequest.findMany({
    where: {
      toUserId: req.userId,
      status: 'pending',
    },
    include: {
      fromUser: {
        select: {
          id: true,
          name: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json(
    requests.map((request) => ({
      _id: request.id,
      createdAt: request.createdAt,
      fromUser: toParticipantUser(request.fromUser),
    }))
  );
});

app.patch('/api/friend-requests/:id', requireAuth, async (req, res) => {
  try {
    const action = req.body.action;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }

    const request = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.toUserId !== req.userId) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    const updated = await prisma.friendRequest.update({
      where: { id: request.id },
      data: { status: action === 'accept' ? 'accepted' : 'rejected' },
    });

    if (action === 'accept') {
      const pairKey = makePairKey(updated.fromUserId, updated.toUserId);
      const conversation = await prisma.conversation.upsert({
        where: { pairKey },
        update: {
          participantIds: [updated.fromUserId, updated.toUserId],
          lastMessageAt: new Date(),
        },
        create: {
          pairKey,
          participantIds: [updated.fromUserId, updated.toUserId],
          lastMessageAt: new Date(),
        },
      });

      io.to(userRoom(updated.fromUserId)).emit('friend:accepted', {
        byUserId: updated.toUserId,
        conversationId: conversation.id,
      });
      io.to(userRoom(updated.toUserId)).emit('friend:accepted', {
        byUserId: updated.fromUserId,
        conversationId: conversation.id,
      });
    }

    return res.json({ message: `Request ${action}ed` });
  } catch (error) {
    console.error('Process friend request error:', error);
    return res.status(500).json({ error: 'Failed to process friend request' });
  }
});

app.get('/api/friends', requireAuth, async (req, res) => {
  const accepted = await prisma.friendRequest.findMany({
    where: {
      status: 'accepted',
      OR: [{ fromUserId: req.userId }, { toUserId: req.userId }],
    },
  });

  const friendIds = accepted.map((item) =>
    item.fromUserId === req.userId ? item.toUserId : item.fromUserId
  );

  const friends = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: { id: true, name: true, username: true, avatarUrl: true },
  });

  return res.json(friends.map(toParticipantUser));
});

app.get('/api/conversations', requireAuth, async (req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: {
      participantIds: { has: req.userId },
    },
    orderBy: { lastMessageAt: 'desc' },
  });

  const uniqueParticipantIds = [...new Set(conversations.flatMap((item) => item.participantIds))];
  const participantUsers = await prisma.user.findMany({
    where: { id: { in: uniqueParticipantIds } },
    select: { id: true, name: true, username: true, avatarUrl: true },
  });

  const userMap = new Map(participantUsers.map((user) => [user.id, user]));

  const response = await Promise.all(
    conversations.map(async (conversation) => {
      const lastMessage = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          NOT: {
            deletedFor: { has: req.userId },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { content: true, isDeletedForEveryone: true, createdAt: true },
      });

      return {
        _id: conversation.id,
        participants: conversation.participantIds
          .map((id) => userMap.get(id))
          .filter(Boolean)
          .map(toParticipantUser),
        lastMessage,
        lastMessageAt: conversation.lastMessageAt,
      };
    })
  );

  return res.json(response);
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversation = await getConversationIfMember(req.params.id, req.userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const limit = Math.min(Number(req.query.limit) || 100, 200);

    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        NOT: {
          deletedFor: { has: req.userId },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    return res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    console.error('Fetch messages error:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.post('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  try {
    const conversation = await getConversationIfMember(req.params.id, req.userId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    if (content.length > 500) {
      return res.status(400).json({ error: 'Message content exceeds 500 characters' });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content,
        senderId: req.userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    const payload = serializeMessage(message);
    await emitToConversationParticipants(conversation, 'conversation:messageCreated', payload);

    return res.status(201).json(payload);
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

app.patch('/api/messages/:id/delete-for-me', requireAuth, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await getConversationIfMember(message.conversationId, req.userId);
    if (!conversation) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const deletedFor = message.deletedFor.includes(req.userId)
      ? message.deletedFor
      : [...message.deletedFor, req.userId];

    await prisma.message.update({
      where: { id: message.id },
      data: { deletedFor },
    });

    return res.json({
      message: 'Message deleted for current user',
      id: message.id,
    });
  } catch (error) {
    console.error('Delete for me error:', error);
    return res.status(500).json({ error: 'Failed to delete message for current user' });
  }
});

app.patch('/api/messages/:id/delete-for-everyone', requireAuth, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await getConversationIfMember(message.conversationId, req.userId);
    if (!conversation) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (message.senderId !== req.userId) {
      return res.status(403).json({ error: 'Only the sender can delete for everyone' });
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        isDeletedForEveryone: true,
        content: 'This message was deleted',
        isPinned: false,
        pinnedBy: null,
        pinnedAt: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    const payload = serializeMessage(updated);
    await emitToConversationParticipants(conversation, 'conversation:messageUpdated', payload);

    return res.json(payload);
  } catch (error) {
    console.error('Delete for everyone error:', error);
    return res.status(500).json({ error: 'Failed to delete message for everyone' });
  }
});

app.patch('/api/messages/:id/pin', requireAuth, async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await getConversationIfMember(message.conversationId, req.userId);
    if (!conversation) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (message.isDeletedForEveryone) {
      return res.status(400).json({ error: 'Deleted messages cannot be pinned' });
    }

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: {
        isPinned: !message.isPinned,
        pinnedBy: message.isPinned ? null : req.userId,
        pinnedAt: message.isPinned ? null : new Date(),
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    const payload = serializeMessage(updated);
    await emitToConversationParticipants(conversation, 'conversation:messageUpdated', payload);

    return res.json(payload);
  } catch (error) {
    console.error('Pin message error:', error);
    return res.status(500).json({ error: 'Failed to update pin state' });
  }
});

const PORT = Number(process.env.PORT) || 5000;

async function bootstrap() {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

bootstrap();
