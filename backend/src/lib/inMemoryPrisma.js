const { randomUUID } = require('crypto');

function now() {
  return new Date();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function pick(obj, select) {
  if (!select) {
    return obj;
  }

  const out = {};
  for (const key of Object.keys(select)) {
    if (select[key]) {
      out[key] = obj[key];
    }
  }
  return out;
}

function startsWithInsensitive(value, startsWith) {
  if (typeof value !== 'string' || typeof startsWith !== 'string') {
    return false;
  }
  return value.toLowerCase().startsWith(startsWith.toLowerCase());
}

function sortByCreatedAtDesc(a, b) {
  return new Date(b.createdAt) - new Date(a.createdAt);
}

function sortByCreatedAtAsc(a, b) {
  return new Date(a.createdAt) - new Date(b.createdAt);
}

class InMemoryPrisma {
  constructor() {
    this.users = [];
    this.friendRequests = [];
    this.conversations = [];
    this.messages = [];

    this.user = {
      findUnique: async ({ where }) => {
        const key = Object.keys(where || {})[0];
        const value = where?.[key];
        const found = this.users.find((item) => item[key] === value);
        return found ? clone(found) : null;
      },

      findFirst: async ({ where }) => {
        const found = this.users.find((user) => {
          if (where?.username && user.username !== where.username) {
            return false;
          }
          if (where?.NOT?.id && user.id === where.NOT.id) {
            return false;
          }
          return true;
        });
        return found ? clone(found) : null;
      },

      findMany: async ({ where, select, take } = {}) => {
        let list = [...this.users];

        if (where?.id?.in) {
          list = list.filter((item) => where.id.in.includes(item.id));
        }

        if (where?.NOT?.id) {
          list = list.filter((item) => item.id !== where.NOT.id);
        }

        if (where?.username?.startsWith) {
          list = list.filter((item) =>
            startsWithInsensitive(item.username, where.username.startsWith),
          );
        }

        if (typeof take === 'number') {
          list = list.slice(0, take);
        }

        return clone(list.map((item) => pick(item, select)));
      },

      create: async ({ data }) => {
        const record = {
          id: randomUUID(),
          googleId: data.googleId,
          email: data.email,
          name: data.name,
          avatarUrl: data.avatarUrl || null,
          username: data.username,
          createdAt: now(),
          updatedAt: now(),
        };
        this.users.push(record);
        return clone(record);
      },

      update: async ({ where, data }) => {
        const index = this.users.findIndex((item) => item.id === where.id);
        if (index < 0) {
          throw new Error('User not found');
        }

        this.users[index] = {
          ...this.users[index],
          ...data,
          updatedAt: now(),
        };

        return clone(this.users[index]);
      },
    };

    this.friendRequest = {
      findFirst: async ({ where }) => {
        const found = this.friendRequests.find((item) => {
          if (where?.status && item.status !== where.status) {
            return false;
          }

          if (where?.fromUserId && item.fromUserId !== where.fromUserId) {
            return false;
          }

          if (where?.toUserId && item.toUserId !== where.toUserId) {
            return false;
          }

          if (where?.OR?.length) {
            const matches = where.OR.some((rule) => {
              const fromOk =
                !rule.fromUserId || item.fromUserId === rule.fromUserId;
              const toOk = !rule.toUserId || item.toUserId === rule.toUserId;
              return fromOk && toOk;
            });
            if (!matches) {
              return false;
            }
          }

          return true;
        });

        return found ? clone(found) : null;
      },

      upsert: async ({ where, update, create }) => {
        const key = where?.fromUserId_toUserId;
        const index = this.friendRequests.findIndex(
          (item) =>
            item.fromUserId === key.fromUserId && item.toUserId === key.toUserId,
        );

        if (index >= 0) {
          this.friendRequests[index] = {
            ...this.friendRequests[index],
            ...update,
            updatedAt: now(),
          };
          return clone(this.friendRequests[index]);
        }

        const record = {
          id: randomUUID(),
          fromUserId: create.fromUserId,
          toUserId: create.toUserId,
          status: create.status || 'pending',
          createdAt: now(),
          updatedAt: now(),
        };

        this.friendRequests.push(record);
        return clone(record);
      },

      findMany: async ({ where, include, orderBy }) => {
        let list = this.friendRequests.filter((item) => {
          if (where?.status && item.status !== where.status) {
            return false;
          }

          if (where?.toUserId && item.toUserId !== where.toUserId) {
            return false;
          }

          if (where?.OR?.length) {
            const matches = where.OR.some((rule) => {
              const fromOk =
                !rule.fromUserId || item.fromUserId === rule.fromUserId;
              const toOk = !rule.toUserId || item.toUserId === rule.toUserId;
              return fromOk && toOk;
            });
            if (!matches) {
              return false;
            }
          }

          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list = [...list].sort(sortByCreatedAtDesc);
        }

        const mapped = list.map((item) => {
          if (include?.fromUser) {
            const foundUser = this.users.find((u) => u.id === item.fromUserId);
            return {
              ...item,
              fromUser: pick(foundUser || {}, include.fromUser.select),
            };
          }
          return item;
        });

        return clone(mapped);
      },

      findUnique: async ({ where }) => {
        const found = this.friendRequests.find((item) => item.id === where.id);
        return found ? clone(found) : null;
      },

      update: async ({ where, data }) => {
        const index = this.friendRequests.findIndex((item) => item.id === where.id);
        if (index < 0) {
          throw new Error('Friend request not found');
        }

        this.friendRequests[index] = {
          ...this.friendRequests[index],
          ...data,
          updatedAt: now(),
        };

        return clone(this.friendRequests[index]);
      },
    };

    this.conversation = {
      findUnique: async ({ where }) => {
        const key = Object.keys(where || {})[0];
        const value = where?.[key];
        const found = this.conversations.find((item) => item[key] === value);
        return found ? clone(found) : null;
      },

      upsert: async ({ where, update, create }) => {
        const index = this.conversations.findIndex(
          (item) => item.pairKey === where.pairKey,
        );

        if (index >= 0) {
          this.conversations[index] = {
            ...this.conversations[index],
            ...update,
            updatedAt: now(),
          };
          return clone(this.conversations[index]);
        }

        const record = {
          id: randomUUID(),
          pairKey: create.pairKey,
          participantIds: create.participantIds || [],
          lastMessageAt: create.lastMessageAt || now(),
          createdAt: now(),
          updatedAt: now(),
        };

        this.conversations.push(record);
        return clone(record);
      },

      findMany: async ({ where, orderBy }) => {
        let list = this.conversations.filter((item) => {
          if (where?.participantIds?.has) {
            return item.participantIds.includes(where.participantIds.has);
          }
          return true;
        });

        if (orderBy?.lastMessageAt === 'desc') {
          list = [...list].sort(
            (a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt),
          );
        }

        return clone(list);
      },

      update: async ({ where, data }) => {
        const index = this.conversations.findIndex((item) => item.id === where.id);
        if (index < 0) {
          throw new Error('Conversation not found');
        }

        this.conversations[index] = {
          ...this.conversations[index],
          ...data,
          updatedAt: now(),
        };

        return clone(this.conversations[index]);
      },
    };

    this.message = {
      findFirst: async ({ where, orderBy, select }) => {
        let list = this.messages.filter((item) => {
          if (where?.conversationId && item.conversationId !== where.conversationId) {
            return false;
          }

          if (where?.NOT?.deletedFor?.has) {
            return !item.deletedFor.includes(where.NOT.deletedFor.has);
          }

          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list = [...list].sort(sortByCreatedAtDesc);
        }

        const first = list[0];
        if (!first) {
          return null;
        }

        return clone(pick(first, select));
      },

      findMany: async ({ where, orderBy, take, include } = {}) => {
        let list = this.messages.filter((item) => {
          if (where?.conversationId && item.conversationId !== where.conversationId) {
            return false;
          }

          if (where?.NOT?.deletedFor?.has) {
            return !item.deletedFor.includes(where.NOT.deletedFor.has);
          }

          return true;
        });

        if (orderBy?.createdAt === 'desc') {
          list = [...list].sort(sortByCreatedAtDesc);
        }

        if (typeof take === 'number') {
          list = list.slice(0, take);
        }

        const mapped = list.map((item) => {
          if (include?.sender) {
            const sender = this.users.find((u) => u.id === item.senderId);
            return {
              ...item,
              sender: pick(sender || {}, include.sender.select),
            };
          }
          return item;
        });

        return clone(mapped);
      },

      create: async ({ data, include }) => {
        const record = {
          id: randomUUID(),
          conversationId: data.conversationId,
          content: data.content,
          senderId: data.senderId,
          isDeletedForEveryone: false,
          deletedFor: [],
          isPinned: false,
          pinnedBy: null,
          pinnedAt: null,
          createdAt: now(),
          updatedAt: now(),
        };

        this.messages.push(record);

        if (include?.sender) {
          const sender = this.users.find((u) => u.id === record.senderId);
          return clone({
            ...record,
            sender: pick(sender || {}, include.sender.select),
          });
        }

        return clone(record);
      },

      findUnique: async ({ where }) => {
        const found = this.messages.find((item) => item.id === where.id);
        return found ? clone(found) : null;
      },

      update: async ({ where, data, include }) => {
        const index = this.messages.findIndex((item) => item.id === where.id);
        if (index < 0) {
          throw new Error('Message not found');
        }

        this.messages[index] = {
          ...this.messages[index],
          ...data,
          updatedAt: now(),
        };

        const updated = this.messages[index];

        if (include?.sender) {
          const sender = this.users.find((u) => u.id === updated.senderId);
          return clone({
            ...updated,
            sender: pick(sender || {}, include.sender.select),
          });
        }

        return clone(updated);
      },
    };
  }

  async $connect() {
    return true;
  }
}

module.exports = new InMemoryPrisma();
