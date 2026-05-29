const Task = require('../models/Task');
const { readTaskFromStored, maybeMigrateTaskDoc } = require('./taskPii');

async function toClientTask(task) {
  if (!task) return task;
  await maybeMigrateTaskDoc(Task, task);
  return readTaskFromStored(task);
}

async function toClientTaskList(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const out = [];
  for (const t of list) {
    out.push(await toClientTask(t));
  }
  return out;
}

module.exports = {
  toClientTask,
  toClientTaskList,
};
