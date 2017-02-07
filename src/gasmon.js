'use strict'

const AWS = require('aws-sdk')
const extend = require('extend')
const fs = require('fs')
const moment = require('moment')
const push = require('pushover-notifications')
const request = require('request')
const xml2js = require('xml2js')

const sprintf = require('sprintf-js').sprintf

const stateTableName = process.env.gasmon_stateTable_name
const stateTableKey = process.env.gasmon_stateTable_key

const pushSession = new push({
  user: process.env.cred_pushover_userKey,
  token: process.env.cred_pushover_appKey,
})

const DataSourceUrl = "https://vipmember.tmtd.cpc.com.tw/OpenData/ListPriceWebService.asmx"

const ProductNameMapping = Object.freeze({
  "92無鉛汽油": '92',
  "95無鉛汽油": '95',
  "98無鉛汽油": '98',
  "超級柴油": 'diesel'
})

const ColumnNameMapping = Object.freeze({
  '產品名稱': 'item',
  '參考牌價': 'price',
  '牌價生效時間': 'effective'
})

AWS.config.update({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION
})

function writeLogs(payload){
  console.log(payload.items)
  return payload
}

function fetch() {
  return fetchBody()
    .then(parseXml)
    .then(extractPricing)
}

function handler(evt, ctx, cb) {
  return fetch()
    .then(writeLogs)
    .then(updateStore)
    .then(composeMessage)
    .then(notify)
    .then(result => {
      cb(null, result.items)
    }, cb)
}

function fetchBody(options){
  options = options || {}

  let url = options.url || DataSourceUrl

  return new Promise((resolve, reject) => {
    request.post({
      url: url,
      gzip: true,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8"
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <getCPCMainProdListPrice xmlns="http://tmtd.cpc.com.tw/" />
  </soap12:Body>
</soap12:Envelope>`
    }, (err, response, body) =>
      err ? reject(err) : resolve({body})
    )
  })
}

function updateStore(payload) {
  let ddb = new AWS.DynamoDB()
  let newValue = JSON.stringify(payload.items)

  return new Promise((resolve, reject) => {
    ddb.putItem({
      TableName: stateTableName,
      ReturnValues: 'ALL_OLD',
      Item: {
        pid: {S: stateTableKey},
        items: {S: newValue},
      },
      ConditionExpression: "#i <> :i",
      ExpressionAttributeNames: {
        '#i': 'items',
      },
      ExpressionAttributeValues: {
        ':i': {S: newValue},
      }
    }, (err, result) => {
      if (err) {
        if (err.code == 'ConditionalCheckFailedException') {
          return resolve(payload)
        }
        return reject(err)
      } 

      resolve(extend(payload, {oldItems: JSON.parse(result.Attributes.items.S)}))
    })
  })
}

function composeMessage(payload) {
  function _avgPrice(items) {
    let sum = 0.0
    let count = 0

    for (let item of items) {
      sum += item.price
      count++
    }

    return count ? sum / count : 0
  }

  function _title() {
    let newPrice = _avgPrice(payload.items)
    let oldPrice = payload.oldItems ? _avgPrice(payload.oldItems) : undefined
    let upPct = oldPrice ? Math.round(100 * (newPrice - oldPrice) / oldPrice) : 0

    let change = upPct > 0 
      ? sprintf('上漲 %d%%', upPct)
      : upPct < 0 
        ? sprintf('下跌 %d%%', -upPct)
        : '不變'

    return `[gasmon] 次期油價${change}`
  }
  
  function _msg() {
    let buff = {}
    for (let obj of payload.items) {
      buff[obj.effective] = buff[obj.effective] || {}
      buff[obj.effective][obj.item] = obj.price
    }

    let lines = []
    for (let effective in buff) {
      let dtStr = moment(effective).format('MM/DD HH:mm')
      lines.push(`${dtStr} 起生效:`)

      for (let item in buff[effective]) {
        lines.push(sprintf("  %s: %.2f, ", item, buff[effective][item]))
      }
    }

    return lines.join("\n")
  }

  return Promise.resolve(extend(payload, 
    {msg: {title: _title(), message: _msg()}
  }))
}

function notify(payload) {
  if (!payload.msg) {
    console.error('payload.msg missing.', payload)
    return Promise.resolve(payload)
  }

  if (!payload.oldItems) {
    return Promise.resolve(payload)
  }

  return new Promise((resolve, reject) => {
    pushSession.send(payload.msg, (err, result) => {
      err ? reject(err) : resolve(payload)
    })
  })
}

function parseXml(payload) {
  let xmlString = payload.body

  return new Promise((resolve, reject) => {
    xml2js.parseString(xmlString, (err, json) =>
      err ? reject(err) : resolve(extend(payload, {json}))
    )
  })
}

function extractPricing(payload) {
  let pricingTable = payload.json['soap:Envelope']['soap:Body'][0]
    .getCPCMainProdListPriceResponse[0]
    .getCPCMainProdListPriceResult[0]
    ['diffgr:diffgram'][0].NewDataSet[0].tbTable

  let items = []
  let productNames = Object.keys(ProductNameMapping)

  for (let pricing of pricingTable) {
    try {
      let buf = {}
      let productName = pricing['產品名稱'][0]

      if (! ProductNameMapping[productName]) {
        continue
      }

      for (let columnFind in ColumnNameMapping) {
        let columnReplace = ColumnNameMapping[columnFind]

        buf[columnReplace] = (columnReplace == 'price')
          ? Number.parseFloat(pricing[columnFind][0])
          : pricing[columnFind][0]
      }

      items.push(buf)

    } catch (err){
      console.error(err)
      continue
    }
  }

  return Promise.resolve(extend(payload, {items}))
}

module.exports = {
  composeMessage,
  extractPricing,
  fetch,
  fetchBody,
  handler,
  notify,
  parseXml,
  updateStore,
}
