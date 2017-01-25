'use strict'

const fs = require('fs')
const libxmljs = require('libxmljs')
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


function monitor() {
  return fetchBody().then(extractXml)
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

function extractXml(xmlString) {
  let xmlDoc = libxmljs.parseXml(xmlString)
  let output = []
  let productNames = Object.keys(ProductNameMapping)
  let tbTables = xmlDoc.find('//tbTable')

  for (let tIdx in tbTables) {
    try {
      let buf = {}
      let tbTable = tbTables[tIdx]
      let productName = tbTable.find('產品名稱')[0].text().trim()

      if (! (productName = ProductNameMapping[productName])) {
        continue
      }

      let columns = tbTable.childNodes()

      for (let idx in columns) {
        let column = columns[idx]
        let newColumnName = ColumnNameMapping[column.name()]
        if (!newColumnName) {
          continue
        }

        let val = column.text()
        buf[newColumnName] = newColumnName == 'item'
          ? productName
          : newColumnName == 'price'
            ? Number.parseFloat(val.trim())
            : val.trim()
      }

      output.push(buf)

    } catch (err){
      continue
    }
  }

  return Promise.resolve(output)
}

module.exports = {
  extractXml,
  fetchBody,
  monitor,
}
