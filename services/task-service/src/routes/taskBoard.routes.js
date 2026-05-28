const express = require('express');
const controller = require('../controllers/taskBoard.controller');

const router = express.Router();

router.post('/', controller.createBoard.bind(controller));
router.get('/', controller.listBoards.bind(controller));

// Card — segment cố định trước /:boardId
router.patch('/cards/:cardId/move', controller.moveCard.bind(controller));
router.post('/cards/:cardId/copy', controller.copyCard.bind(controller));
router.delete('/cards/:cardId', controller.archiveCard.bind(controller));
router.post('/cards/:cardId/archive', controller.archiveCard.bind(controller));
router.post('/cards/:cardId/comments', controller.addCardComment.bind(controller));
router.patch('/cards/:cardId', controller.updateCard.bind(controller));

// List actions (có boardId — khớp mount gateway)
router.patch('/:boardId/lists/:listId', controller.reorderList.bind(controller));
router.post('/:boardId/lists/:listId/copy', controller.copyList.bind(controller));
router.post('/:boardId/lists/:listId/move', controller.moveList.bind(controller));
router.post('/:boardId/lists/:listId/move-all-cards', controller.moveAllCardsInList.bind(controller));
router.put('/:boardId/lists/:listId/watch', controller.watchList.bind(controller));
router.post('/:boardId/lists/:listId/watch', controller.watchList.bind(controller));
router.delete('/:boardId/lists/:listId/watch', controller.unwatchList.bind(controller));
router.delete('/:boardId/lists/:listId', controller.archiveList.bind(controller));
router.post('/:boardId/lists/:listId/archive', controller.archiveList.bind(controller));

// Alias không boardId (tương thích)
router.patch('/lists/:listId', controller.reorderList.bind(controller));
router.post('/lists/:listId/copy', controller.copyList.bind(controller));
router.post('/lists/:listId/move', controller.moveList.bind(controller));
router.post('/lists/:listId/move-all-cards', controller.moveAllCardsInList.bind(controller));
router.put('/lists/:listId/watch', controller.watchList.bind(controller));
router.post('/lists/:listId/watch', controller.watchList.bind(controller));
router.delete('/lists/:listId/watch', controller.unwatchList.bind(controller));

router.get('/:boardId/assignable-members', controller.listAssignableMembers.bind(controller));
router.get('/:boardId', controller.getBoardDetail.bind(controller));
router.post('/:boardId/lists', controller.createList.bind(controller));
router.post('/:boardId/cards', controller.createCard.bind(controller));

module.exports = router;
