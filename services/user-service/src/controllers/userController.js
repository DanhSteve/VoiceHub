const UserProfile = require('../models/UserProfile');
const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AUTH_SERVICE_URL) throw new Error('Thiếu biến môi trường: AUTH_SERVICE_URL');

exports.getMyProfile = async (req, res, next) => {
  try {
    let profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      profile = await UserProfile.create({ userId: req.user._id });
    }

    res.json({
      status: 'success',
      data: {
        ...req.user.toObject(),
        profile,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { bio, phone, location, timezone, language, notifications, privacy } = req.body;

    let profile = await UserProfile.findOne({ userId: req.user._id });
    if (!profile) {
      profile = new UserProfile({ userId: req.user._id });
    }

    Object.assign(profile, { bio, phone, location, timezone, language, notifications, privacy });
    await profile.save();

    res.json({ status: 'success', data: profile });
  } catch (error) {
    next(error);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    // Get user from auth service
    const token = req.headers.authorization;
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/users/${req.params.id}`, {
      headers: { Authorization: token },
    });

    const profile = await UserProfile.findOne({ userId: req.params.id });

    res.json({
      status: 'success',
      data: {
        ...response.data.data,
        profile,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.searchUsers = async (req, res, next) => {
  try {
    const { q } = req.query;
    // Search via auth service
    const token = req.headers.authorization;
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/users/search?q=${q}`, {
      headers: { Authorization: token },
    });

    res.json(response.data);
  } catch (error) {
    next(error);
  }
};

exports.getUserStatus = async (req, res, next) => {
  try {
    // Get from Redis or auth service
    res.json({ status: 'success', data: { status: 'online' } });
  } catch (error) {
    next(error);
  }
};

exports.updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    // Update in Redis and broadcast via Socket
    res.json({ status: 'success', data: { status } });
  } catch (error) {
    next(error);
  }
};

exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'fail', message: 'No file uploaded' });
    }

    // TODO: Upload to S3
    const avatarUrl = `/uploads/${req.file.filename}`;

    res.json({ status: 'success', data: { avatarUrl } });
  } catch (error) {
    next(error);
  }
};
