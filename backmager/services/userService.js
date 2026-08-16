const createError = require('http-errors');
const userRepository = require('../repositories/userRepository');
const { parsePagination, buildMeta } = require('../utils/pagination');
const db = require('../config/database');

async function getUserList (query) {
  const { page, pageSize, offset } = parsePagination(query);
  const filters = {
    keyword: query.keyword || '',
    status: query.status !== undefined ? Number(query.status) : undefined,
    startDate: query.startDate,
    endDate: query.endDate,
    sort: query.sort,
    order: query.order,
    offset,
    limit: pageSize
  };

  const [total, list] = await Promise.all([
    userRepository.countUsers(filters),
    userRepository.listUsers(filters)
  ]);

  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

async function getUserDetail (id) {
  const user = await userRepository.getUserById(id);
  if (!user) {
    throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
  }

  const [documents, transactions] = await Promise.all([
    userRepository.getUserDocuments(id, 10),
    userRepository.getCreditTransactions(id, 20)
  ]);

  return { user, documents, transactions };
}

async function createUser (payload) {
  const phone = String(payload.phone || '').trim();
  if (!phone) {
    throw createError(400, '手机号不能为空', { code: 'PHONE_REQUIRED' });
  }

  const existing = await userRepository.getUserByPhone(phone);
  if (existing) {
    throw createError(409, '手机号已存在', { code: 'PHONE_EXISTS' });
  }

  const nickname = payload.nickname ? String(payload.nickname).trim() : `用户${phone.slice(-4) || Date.now()}`;
  const user = await db.transaction(async (connection) => {
    const inviteCode = await userRepository.generateUniqueInviteCode(connection, nickname);
    const userId = await userRepository.createUser(connection, {
      phone,
      nickname,
      avatar: payload.avatar || null,
      email: payload.email || null,
      status: payload.status !== undefined ? Number(payload.status) : 1,
      inviteCode
    });

    const initialCredits = Number(payload.initialCredits || 0);
    await userRepository.createCreditAccount(connection, userId, initialCredits);

    if (initialCredits > 0) {
      await userRepository.insertCreditTransaction(connection, {
        userId,
        type: 'earn',
        amount: initialCredits,
        balanceAfter: initialCredits,
        source: 'admin_create',
        sourceId: null,
        description: '后台创建用户赠送初始积分'
      });
    }

    return userRepository.getUserByIdWithConnection(connection, userId);
  });

  return user;
}

async function updateUser (id, payload) {
  const user = await userRepository.getUserById(id);
  if (!user) {
    throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
  }

  const phone = payload.phone !== undefined ? String(payload.phone).trim() : undefined;
  if (phone && phone !== user.phone) {
    const existing = await userRepository.getUserByPhone(phone);
    if (existing && existing.id !== id) {
      throw createError(409, '手机号已存在', { code: 'PHONE_EXISTS' });
    }
  }

  await userRepository.updateUser(id, {
    phone,
    nickname: payload.nickname !== undefined ? String(payload.nickname).trim() : undefined,
    avatar: payload.avatar !== undefined ? payload.avatar : undefined,
    email: payload.email !== undefined ? payload.email : undefined,
    status: payload.status !== undefined ? Number(payload.status) : undefined
  });

  return userRepository.getUserById(id);
}

async function deleteUser (id) {
  const user = await userRepository.getUserById(id);
  if (!user) {
    throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
  }

  await userRepository.deleteUser(id);
  return true;
}

async function changeUserStatus (id, status) {
  const user = await userRepository.getUserById(id);
  if (!user) {
    throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
  }

  await userRepository.updateStatus(id, status);
  return true;
}

async function adjustUserCredits (userId, { amount, reason = '', operator }) {
  const delta = Number(amount);
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    throw createError(400, '积分变动值必须是非零整数', { code: 'INVALID_AMOUNT' });
  }

  return db.transaction(async (connection) => {
    const user = await userRepository.getUserForUpdate(connection, userId);
    if (!user) {
      throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
    }
    if (user.status !== 1) {
      throw createError(400, '用户状态异常，无法调整积分', { code: 'USER_DISABLED' });
    }

    let account = await userRepository.getCreditAccountForUpdate(connection, userId);
    if (!account) {
      await userRepository.createCreditAccount(connection, userId);
      account = { credits: 0, total_earned: 0, total_consumed: 0 };
    }

    const newBalance = account.credits + delta;
    if (newBalance < 0) {
      throw createError(400, '积分不足，无法扣减', { code: 'INSUFFICIENT_CREDITS' });
    }

    const type = delta > 0 ? 'earn' : 'consume';
    const absAmount = Math.abs(delta);
    const totalEarned = type === 'earn' ? account.total_earned + absAmount : account.total_earned;
    const totalConsumed = type === 'consume' ? account.total_consumed + absAmount : account.total_consumed;

    await userRepository.updateCreditAccount(connection, userId, {
      credits: newBalance,
      totalEarned,
      totalConsumed
    });

    const operatorInfo = operator ? `[管理员:${operator.displayName || operator.username || operator.id}]` : '';
    const description = [operatorInfo, reason].filter(Boolean).join(' ').trim() || '后台手动调整';

    await userRepository.insertCreditTransaction(connection, {
      userId,
      type,
      amount: absAmount,
      balanceAfter: newBalance,
      source: 'admin_adjust',
      sourceId: operator?.id || null,
      description
    });

    return {
      userId,
      balance: newBalance,
      delta,
      type,
      totalEarned,
      totalConsumed
    };
  });
}

async function getCreditTransactionsPaginated (userId, query) {
  const user = await userRepository.getUserById(userId);
  if (!user) {
    throw createError(404, '用户不存在', { code: 'USER_NOT_FOUND' });
  }

  const { page, pageSize, offset } = parsePagination(query);
  const [total, list] = await Promise.all([
    userRepository.countCreditTransactionsByUser(userId),
    userRepository.listCreditTransactionsByUser({ userId, offset, limit: pageSize })
  ]);

  return {
    list,
    pagination: buildMeta({ page, pageSize }, total)
  };
}

module.exports = {
  getUserList,
  getUserDetail,
  createUser,
  updateUser,
  deleteUser,
  changeUserStatus,
  adjustUserCredits,
  getCreditTransactionsPaginated
};
