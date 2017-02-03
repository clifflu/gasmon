'use strict'

const fs = require('fs')
const xml2js = require('xml2js')
const request = require('request')

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

const writeLogs = console.log

function query() {
  return fetchBody().then(parseXml).then(extractPricing)
}

function fetchBody(options){
  options = options || {}

  let url = options.url || "https://vipmember.tmtd.cpc.com.tw/OpenData/ListPriceWebService.asmx"

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
      err ? reject(err) : resolve(body)
    )
  })
}

function parseXml(xmlString) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xmlString, (err, result) =>
      err ? reject(err) : resolve(result)
    )
  })
}

function extractPricing(pricing) {
  let pricingTable = pricing['soap:Envelope']['soap:Body'][0]
    .getCPCMainProdListPriceResponse[0]
    .getCPCMainProdListPriceResult[0]
    ['diffgr:diffgram'][0].NewDataSet[0].tbTable

  let output = []
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

        buf[columnReplace] = columnReplace == 'pricing'
          ? Number.parseFloat(pricing[columnFind][0])
          : pricing[columnFind][0]
      }

      output.push(buf)

    } catch (err){
      console.error(err)
      continue
    }
  }

  return Promise.resolve(output)
}

module.exports = {
  extractPricing,
  fetchBody,
  query,
  writeLogs,
}
