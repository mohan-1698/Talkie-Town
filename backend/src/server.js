require('dotenv').config();

const cors = require('cors');
const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const Conversation = require('./models/Conversation');
const FriendRequest = require('./models/FriendRequest');
const Message = require('./models/Message');
const User = require('./models/User');

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
    id: user._id,
    name: user.name,
    email: user.email,
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

  for (let i = 0; i < 30; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 6);
    const candidate = `${base}_${suffix}`.slice(0, 24);
    const exists = await User.exists({ username: candidate });
    if (!exists) {
      return candidate;
    }
  }

  return `user_${Date.now().toString().slice(-6)}`;
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
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return null;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return null;
  }

  const isMember = conversation.participantIds.some(
    (participantId) => String(participantId) === String(userId)
  );

  if (!isMember) {
    return null;
  }

  return conversation;
}

async function emitToConversationParticipants(conversation, eventName, payload) {
  for (const participantId of conversation.participantIds) {
    io.to(userRoom(participantId)).emit(eventName, payload);
  }
  io.to(conversationRoom(conversation._id)).emit(eventName, payload);
}

async function serializeMessage(messageDoc) {
  const populated = await messageDoc.populate('senderId', 'name username avatarUrl');
  return {
    _id: populated._id,
    conversationId: populated.conversationId,
    content: populated.content,
    sender: populated.senderId,
    isDeletedForEveryone: populated.isDeletedForEveryone,
    isPinned: populated.isPinned,
    pinnedBy: populated.pinnedBy,
    pinnedAt: populated.pinnedAt,
    createdAt: populated.createdAt,
    updatedAt: populated.updatedAt,
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
      socket.join(conversationRoom(conversation._id));
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

    let user = await User.findOne({ googleId: payload.sub });

    if (!user) {
      user = await User.create({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.picture || null,
        username: await generateUniqueUsername(payload.email.split('@')[0]),
      });
    } else {
      user.name = payload.name;
      user.avatarUrl = payload.picture || user.avatarUrl;
      await user.save();
    }

    const token = jwt.sign({ sub: user._id.toString() }, jwtSecret, { expiresIn: '7d' });

    return res.json({ token, user: toPublicUser(user) });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(401).json({ error: 'Google authentication failed' });
  }
});

app.get('/api/users/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
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

  const existing = await User.findOne({ username, _id: { $ne: req.userId } });
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const updated = await User.findByIdAndUpdate(req.userId, { username }, { new: true });

  return res.json(toPublicUser(updated));
});

app.get('/api/users/search', requireAuth, async (req, res) => {
  const term = typeof req.query.username === 'string' ? req.query.username.trim().toLowerCase() : '';
  if (term.length < 2) {
    return res.status(400).json({ error: 'Search term must be at least 2 characters' });
  }

  const users = await User.find({
    _id: { $ne: req.userId },
    username: { $regex: `^${term}`, $options: 'i' },
  })
    .select('name username avatarUrl')
    .limit(10)
    .lean();

  return res.json(users);
});

app.post('/api/friend-requests', requireAuth, async (req, res) => {
  try {
    const toUsername = typeof req.body.toUsername === 'string' ? req.body.toUsername.trim().toLowerCase() : '';
    if (!toUsername) {
      return res.status(400).json({ error: 'toUsername is required' });
    }

    const fromUser = await User.findById(req.userId);
    const toUser = await User.findOne({ username: toUsername });

    if (!fromUser || !toUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (String(toUser._id) === String(fromUser._id)) {
      return res.status(400).json({ error: 'You cannot send a request to yourself' });
    }

    const accepted = await FriendRequest.findOne({
      status: 'accepted',
      $or: [
        { fromUserId: fromUser._id, toUserId: toUser._id },
        { fromUserId: toUser._id, toUserId: fromUser._id },
      ],
    });

    if (accepted) {
      return res.status(409).json({ error: 'You are already friends' });
    }

    const reversePending = await FriendRequest.findOne({
      fromUserId: toUser._id,
      toUserId: fromUser._id,
      status: 'pending',
    });

    if (reversePending) {
      reversePending.status = 'accepted';
      await reversePending.save();

      const pairKey = makePairKey(fromUser._id, toUser._id);
      const conversation = await Conversation.findOneAndUpdate(
        { pairKey },
        {
          pairKey,
          participantIds: [fromUser._id, toUser._id],
          lastMessageAt: new Date(),
        },
        { new: true, upsert: true }
      );

      io.to(userRoom(toUser._id)).emit('friend:accepted', {
        byUser: toPublicUser(fromUser),
        conversationId: conversation._id,
      });
      io.to(userRoom(fromUser._id)).emit('friend:accepted', {
        byUser: toPublicUser(toUser),
        conversationId: conversation._id,
      });

      return res.json({ message: 'Friend request auto-accepted from reverse pending request' });
    }

    const request = await FriendRequest.findOneAndUpdate(
      { fromUserId: fromUser._id, toUserId: toUser._id },
      {
        fromUserId: fromUser._id,
        toUserId: toUser._id,
        status: 'pending',
      },
      { new: true, upsert: true }
    );

    io.to(userRoom(toUser._id)).emit('friend:request', {
      requestId: request._id,
      fromUser: toPublicUser(fromUser),
    });

    return res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    return res.status(500).json({ error: 'Failed to send friend request' });
  }
});

app.get('/api/friend-requests/incoming', requireAuth, async (req, res) => {
  const requests = await FriendRequest.find({
    toUserId: req.userId,
    status: 'pending',
  })
    .populate('fromUserId', 'name username avatarUrl')
    .sort({ createdAt: -1 })
    .lean();

  return res.json(
    requests.map((request) => ({
      _id: request._id,
      createdAt: request.createdAt,
      fromUser: request.fromUserId,
    }))
  );
});

app.patch('/api/friend-requests/:id', requireAuth, async (req, res) => {
  try {
    const action = req.body.action;
    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or reject' });
    }

    const request = await FriendRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    if (String(request.toUserId) !== String(req.userId)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    request.status = action === 'accept' ? 'accepted' : 'rejected';
    await request.save();

    if (action === 'accept') {
      const pairKey = makePairKey(request.fromUserId, request.toUserId);
      const conversation = await Conversation.findOneAndUpdate(
        { pairKey },
        {
          pairKey,
          participantIds: [request.fromUserId, request.toUserId],
          lastMessageAt: new Date(),
        },
        { new: true, upsert: true }
      );

      io.to(userRoom(request.fromUserId)).emit('friend:accepted', {
        byUserId: request.toUserId,
        conversationId: conversation._id,
      });
      io.to(userRoom(request.toUserId)).emit('friend:accepted', {
        byUserId: request.fromUserId,
        conversationId: conversation._id,
      });
    }

    return res.json({ message: `Request ${action}ed` });
  } catch (error) {
    console.error('Process friend request error:', error);
    return res.status(500).json({ error: 'Failed to process friend request' });
  }
});

app.get('/api/friends', requireAuth, async (req, res) => {
  const accepted = await FriendRequest.find({
    status: 'accepted',
    $or: [{ fromUserId: req.userId }, { toUserId: req.userId }],
  }).lean();

  const friendIds = accepted.map((item) =>
    String(item.fromUserId) === String(req.userId) ? item.toUserId : item.fromUserId
  );

  const friends = await User.find({ _id: { $in: friendIds } })
    .select('name username avatarUrl')
    .lean();

  return res.json(friends);
});

app.get('/api/conversations', requireAuth, async (req, res) => {
  const conversations = await Conversation.find({ participantIds: req.userId })
    .populate('participantIds', 'name username avatarUrl')
    .sort({ lastMessageAt: -1 })
    .lean();

  const response = await Promise.all(
    conversations.map(async (conversation) => {
      const lastMessage = await Message.findOne({
        conversationId: conversation._id,
        deletedFor: { $ne: req.userId },
      })
        .sort({ createdAt: -1 })
        .select('content isDeletedForEveryone createdAt')
        .lean();

      return {
        _id: conversation._id,
        participants: conversation.participantIds,
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

    const messages = await Message.find({
      conversationId: conversation._id,
      deletedFor: { $ne: req.userId },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'name username avatarUrl')
      .lean();

    return res.json(
      messages.reverse().map((message) => ({
        _id: message._id,
        conversationId: message.conversationId,
        content: message.content,
        sender: message.senderId,
        isDeletedForEveryone: message.isDeletedForEveryone,
        isPinned: message.isPinned,
        pinnedBy: message.pinnedBy,
        pinnedAt: message.pinnedAt,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
      }))
    );
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

    const message = await Message.create({
      conversationId: conversation._id,
      content,
      senderId: req.userId,
    });

    conversation.lastMessageAt = new Date();
    await conversation.save();

    const payload = await serializeMessage(message);
    await emitToConversationParticipants(conversation, 'conversation:messageCreated', payload);

    return res.status(201).json(payload);
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

app.patch('/api/messages/:id/delete-for-me', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await getConversationIfMember(message.conversationId, req.userId);
    if (!conversation) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (!message.deletedFor.some((id) => String(id) === String(req.userId))) {
      message.deletedFor.push(req.userId);
      await message.save();
    }

    return res.json({
      message: 'Message deleted for current user',
      id: message._id,
    });
  } catch (error) {
    console.error('Delete for me error:', error);
    return res.status(500).json({ error: 'Failed to delete message for current user' });
  }
});

app.patch('/api/messages/:id/delete-for-everyone', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const conversation = await getConversationIfMember(message.conversationId, req.userId);
    if (!conversation) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (String(message.senderId) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the sender can delete for everyone' });
    }

    message.isDeletedForEveryone = true;
    message.content = 'This message was deleted';
    message.isPinned = false;
    message.pinnedBy = null;
    message.pinnedAt = null;

    await message.save();

    const payload = await serializeMessage(message);
    await emitToConversationParticipants(conversation, 'conversation:messageUpdated', payload);

    return res.json(payload);
  } catch (error) {
    console.error('Delete for everyone error:', error);
    return res.status(500).json({ error: 'Failed to delete message for everyone' });
  }
});

app.patch('/api/messages/:id/pin', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const message = await Message.findById(req.params.id);
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

    message.isPinned = !message.isPinned;
    message.pinnedBy = message.isPinned ? req.userId : null;
    message.pinnedAt = message.isPinned ? new Date() : null;

    await message.save();

    const payload = await serializeMessage(message);
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
