const Friendship = require('../models/Friendship');
const axios = require('axios');
const friendService = require('../services/friend.service');

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');
const USER_SERVICE_INTERNAL_TOKEN = process.env.USER_SERVICE_INTERNAL_TOKEN || '';

exports.getFriends = async (req, res, next) => {
  try {
    const friends = await Friendship.find({
      $or: [
        { requester: req.user._id, status: 'accepted' },
        { recipient: req.user._id, status: 'accepted' },
      ],
    })
      .populate('requester', 'name avatar email')
      .populate('recipient', 'name avatar email');

    const formatted = friends.map((f) => {
      const friend = f.requester._id.toString() === req.user._id.toString() 
        ? f.recipient 
        : f.requester;
      return { ...friend.toObject(), friendshipId: f._id };
    });

    res.json({ status: 'success', data: formatted });
  } catch (error) {
    next(error);
  }
};

exports.getPendingRequests = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userContext?.userId;
    if (!userId) {
      return res.status(401).json({ status: 'fail', message: 'Unauthorized' });
    }
    const requests = await friendService.getFriendRequests(String(userId), 'received');
    res.json({ status: 'success', success: true, data: requests });
  } catch (error) {
    next(error);
  }
};

exports.sendFriendRequest = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ status: 'fail', message: 'Cannot add yourself' });
    }

    const existing = await Friendship.findOne({
      $or: [
        { requester: req.user._id, recipient: userId },
        { requester: userId, recipient: req.user._id },
      ],
    });

    if (existing) {
      return res.status(400).json({ status: 'fail', message: 'Request already exists' });
    }

    const friendship = await Friendship.create({
      requester: req.user._id,
      recipient: userId,
    });

    res.status(201).json({ status: 'success', data: friendship });
  } catch (error) {
    next(error);
  }
};

exports.acceptRequest = async (req, res, next) => {
  try {
    const friendship = await Friendship.findByIdAndUpdate(
      req.params.id,
      { status: 'accepted' },
      { new: true }
    );

    res.json({ status: 'success', data: friendship });
  } catch (error) {
    next(error);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    await Friendship.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ status: 'success', message: 'Request rejected' });
  } catch (error) {
    next(error);
  }
};

exports.removeFriend = async (req, res, next) => {
  try {
    await Friendship.findByIdAndDelete(req.params.id);
    res.json({ status: 'success', message: 'Friend removed' });
  } catch (error) {
    next(error);
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user?.id || req.user?._id;
    if (!userId || !currentUserId) {
      return res.status(400).json({ status: 'fail', message: 'userId is required' });
    }
    await friendService.blockUser(String(currentUserId), String(userId));
    res.json({ status: 'success', message: 'User blocked' });
  } catch (error) {
    next(error);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const currentUserId = req.user?.id || req.user?._id;
    const friendId = req.params.userId;
    if (!friendId || !currentUserId) {
      return res.status(400).json({ status: 'fail', message: 'userId is required' });
    }
    await friendService.unblockUser(String(currentUserId), String(friendId));
    res.json({ status: 'success', message: 'User unblocked' });
  } catch (error) {
    next(error);
  }
};

// Search for a user by phone number via user service
// also include current relationship status if found
exports.searchByPhone = async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ status: 'fail', message: 'Phone parameter is required' });
    }

    const token = String(USER_SERVICE_INTERNAL_TOKEN || '').trim();
    if (!token) {
      return res.status(503).json({
        status: 'fail',
        message: 'User service internal lookup not configured',
      });
    }
    const response = await axios.get(
      `${USER_SERVICE_URL}/api/users/internal/phone/${encodeURIComponent(phone)}`,
      { headers: { 'x-internal-token': token }, timeout: 10000 }
    );
    const userData = response.data?.data;
    if (!userData) {
      return res.status(404).json({ status: 'fail', message: 'User not found' });
    }

    // get relationship to requesting user
    const actorId = req.user?.id || req.user?._id;
    const relationship = await friendService.getRelationship(actorId, userData.userId || userData._id);

    res.json({
      status: 'success',
      data: {
        ...userData,
        relationship,
      },
    });
  } catch (error) {
    // propagate error from remote service or network issue
    if (error.response) {
      return res
        .status(error.response.status)
        .json(error.response.data);
    }
    next(error);
  }
};
