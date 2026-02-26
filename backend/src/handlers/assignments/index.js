const express = require('express');
const router = express.Router();
const crudRoutes = require('./crud');
const submissionRoutes = require('./submissions');
const gradingRoutes = require('./grading');

router.use('/', crudRoutes);
router.use('/', submissionRoutes);
router.use('/', gradingRoutes);

module.exports = router;
