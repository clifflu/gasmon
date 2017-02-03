'use strict'

const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const fs = require('fs')
const path = require('path')

const gasmon = require('../src/gasmon')

const assert = chai.assert

chai.use(chaiAsPromised)

describe('gasmon', function(){

  it('shoudl success', function(){
    let content = fs.readFileSync(path.join(__dirname, 'mock.xml')).toString()
    let p = gasmon.extractXml(content)
    assert.isFulfilled(p)
  })

})
