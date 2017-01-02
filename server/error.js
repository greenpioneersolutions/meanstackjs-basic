exports.log = log

var chalksay = require('chalksay')
var mongoose = require('mongoose')
var ErrorsModel = null

function checkError (err, cb) {
  if (err) {
    chalksay.red('Error trying to record error', err.stack)
    cb && cb(err)
    return true
  }
}

function log (error, cb) {
  if (typeof cb !== 'function') {
    cb = function () {}
  }

  try {
    ErrorsModel = ErrorsModel || mongoose.model('error')
  } catch (e) {
    chalksay.red('This Error happend before mongoose could set up or you have deleted model')
    chalksay.red('This Uncaught Exceptions will not be tracked in the database')
    chalksay.red('Reason:')
    chalksay.red(e.stack)
    chalksay.red('Original error:')
    chalksay.red(error.stack)
    return cb(true)
  }

  if (!(error instanceof Error)) {
    error = new Error(error)
  }

  // error instanceof Error - maybe implement something last that is more specific to only Error's
  ErrorsModel.findOne({
    message: error.message
  }, function (err, data) {
    checkError(err)

    if (!data) {
      var errors = ErrorsModel({
        code: error.code,
        message: error.message,
        name: error.name,
        stack: error.stack,
        type: error.type || 'exception',
        history: [Date.now()]
      })
      errors.save(function (err) {
        if (checkError(err, cb)) { return }
        chalksay.red(errors)
        cb(false)
      })
    } else {
      data.count++
      data.history.push(Date.now())
      data.save(function (err) {
        if (checkError(err, cb)) { return }
        chalksay.red(data)
        cb(false)
      })
    }
  })
}

