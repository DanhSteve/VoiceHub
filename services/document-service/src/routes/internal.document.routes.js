const express = require('express');
const router = express.Router();
const documentController = require('../controllers/document.controller');

router.delete(
  '/purge-organization/:organizationId',
  documentController.purgeOrganizationDocuments.bind(documentController)
);

module.exports = router;
