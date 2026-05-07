const router = require('express').Router();
const auth = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const c = require('../controllers/file.controller');

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

router.get('/',                   auth, wrap(c.listFiles));
router.get('/:fileId',            auth, wrap(c.getFile));
router.post('/upload',            auth, upload.single('file'), wrap(c.uploadFile));
router.post('/presign',           auth, wrap(c.presignUpload));
router.delete('/:fileId',         auth, wrap(c.deleteFile));

module.exports = router;
