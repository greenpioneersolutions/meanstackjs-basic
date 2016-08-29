module.exports = errorMiddleware

function errorMiddleware (self) {
  self.app.use(function (err, req, res, next) {
    var code = 500
    var message = err
    if (err.message || err.msg) {
      message = {message: err.message || err.msg}
    }
    if (err.name === 'ValidationError') {
      err.status = 400
    }
    if (err.message === 'MongoError') {
      err.status = 400
      if (err.code === 11000) message.message = 'duplicate key error '
    }
    if (typeof err.status === 'number') {
      code = err.status
    }
    console.log('\n=== EXCEPTION ===\n' +
      req.method + ': ' + req.url + '\n' +
      err.stack + '\n' +
      'Headers:' + '\n' + req.headers + '\n' +
      'Params:' + '\n' + req.params + '\n' +
      'Body:' + '\n' + req.body + '\n' +
      'Session:' + '\n' + req.session + '\n')

    res.status(code).send(message)
  })
}
