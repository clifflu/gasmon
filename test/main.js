'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const fs = require('fs')
const path = require('path')

const main = require('../src/main')

const assert = chai.assert

chai.use(chaiAsPromised)

describe('main', function(){

  it('shoudl success', function(){
    let content = fs.readFileSync(path.join(__dirname, 'mock.xml')).toString()
    let p = main.extractXml(content)
    assert.isFulfilled(p)
  })

})
