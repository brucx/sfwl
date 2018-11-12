const axios = require('axios');
const crypto = require('crypto');
const xmlJs = require('xml-js');
const querystring = require('querystring');

module.exports = class SFWL {
  constructor({ clientCode, checkWord, endpoint }) {
    this.endpoint = endpoint || 'http://bsp-oisp.sf-express.com/bsp-oisp/sfexpressService';
    this.clientCode = clientCode;
    this.checkWord = checkWord;
  }

  generateVerifyCode(reqXML) {
    const md5 = crypto.createHash('md5');
    const result = md5.update(reqXML + this.checkWord).digest('base64');
    return result;
  }

  buildXML(service, data) {
    const obj = {
      Request: {
        _attributes: {
          service,
          lang: 'zh-CN',
        },
        Head: {
          _text: this.clientCode,
        },
        Body: {
          Order: {
            _attributes: data,
          },
        },
      },
    };
    const result = xmlJs.js2xml(obj, { compact: true });
    return result;
  }

  async request(service, data) {
    const xml = this.buildXML(service, data);
    const verifyCode = this.generateVerifyCode(xml);
    const response = await axios.post(this.endpoint, querystring.stringify({
      xml,
      verifyCode,
    }));
    const result = xmlJs.xml2js(response.data, { compact: true });
    if (result.Response.Head._text !== 'OK') {
      const error = new Error('顺丰下单失败');
      error.result = result;
      throw error;
    }
    return result;
  }

  /**
   * 快递下单
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=763554
   * @param {*} data Order 参数
   * @param {*} addedData AddedService 参数
   */
  async order(data, addedData) {
    const serviceName = 'OrderService';
    if (addedData) {
      Object.assign(data, {
        AddedService: addedData,
      });
    }
    return this.request(serviceName, data);
  }
};
