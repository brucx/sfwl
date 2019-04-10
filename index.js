const axios = require('axios');
const crypto = require('crypto');
const xmlJs = require('xml-js');
const querystring = require('querystring');

class SFError extends Error {
  constructor(...params) {
    super(...params);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SFError);
    }
  }
}

class SFWL {
  constructor({ clientCode, checkWord, endpoint }) {
    this.endpoint = endpoint || 'https://bsp-oisp.sf-express.com/bsp-oisp/sfexpressService';
    this.clientCode = clientCode;
    this.checkWord = checkWord;
  }

  generateVerifyCode(reqXML) { return crypto.createHash('md5').update(reqXML + this.checkWord).digest('base64'); }

  buildXML(service, data) {
    const bodyName = service === 'Route' ? 'RouteRequest' : service;
    const obj = {
      Request: {
        _attributes: {
          service: `${service}Service`,
          lang: 'zh-CN',
        },
        Head: {
          _text: this.clientCode,
        },
        Body: {
          [bodyName]: data,
        },
      },
    };
    const result = xmlJs.js2xml(obj, { compact: true });
    return result;
  }

  parseXML(service, data) {
    const result = xmlJs.xml2js(data, {compact: true});
    const response = result.Response;
    if (response.ERROR) {
      const error = new SFError(response.ERROR._text);
      error.code = response.ERROR._attributes.code;
      return error;
    }
    return this.formatBody(response.Body[`${service}Response`]);
  }

  formatBody(data) {
    for (let attr in data) {
      if (data.hasOwnProperty(attr)) {
        if (attr === '_attributes') {
          Object.assign(data, data[attr]);
          delete data[attr];
        } else {
          if (Array.isArray(data[attr])) {
            data[attr] = data[attr].map(this.formatBody.bind(this));
          } else if (typeof data[attr] === 'object') {
            data[attr] = this.formatBody(data[attr])
          }
        }
      }
    }
    return data;
  }

  async request(service, data) {
    const xml = this.buildXML(service, data);
    const verifyCode = this.generateVerifyCode(xml);
    const response = await axios.post(this.endpoint, querystring.stringify({ xml, verifyCode }));
    const result = this.parseXML(service, response.data);
    if (result instanceof Error) {
      throw result;
    }
    return result;
  }

  /**
   * 快递下单
   * 下订单接口根据客户需要，可提供以下两个功能：
   *  1) 客户系统向顺丰下发订单。
   *  2) 为订单分配运单号。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=763554
   * @param {*} data Order 参数 { orderid!, mailno, is_gen_bill_no... }
   */
  async order(data) {
    const serviceName = 'Order';
    return this.request(serviceName, {
      _attributes: {
        ...data,
        cargos: undefined,
      },
      Cargo: (data.cargos||[]).map(cargo => ({ _attributes: cargo }))
    });
  }

  /**
   * 订单结果查询
   * 因Internet环境下，网络不是绝对可靠，用户系统下订单到顺丰后，不一定可以收到顺丰系统返回的数据，此接口用于在未收到返回数据时，查询下订单（含筛选）接口客户订单当前的处理情况。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=965417
   * @param {*} data OrderSearch 参数 { orderid!, search_type }
   */
  async orderSearch(data) {
    const serviceName = 'OrderSearch';
    return this.request(serviceName, { _attributes: data });
  }

  /**
   * 订单确认/取消
   * 该接口用于：
   *   • 客户在确定将货物交付给顺丰托运后，将运单上的一些重要信息，如快件重量通过此接口发送给顺丰。
   *   • 客户在发货前取消订单。
   * 注意：订单取消之后，订单号也是不能重复利用的。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=970942
   * @param {*} data OrderConfirm 参数 { orderid!, mailno, dealtype, customs_batchs... }
   */
  async orderConfirm(data) {
    const serviceName = 'OrderConfirm';
    return this.request(serviceName, {
      _attributes: {
        ...data,
        options: undefined,
      },
      OrderConfirmOption: data.options ? { _attributes: data.options } : undefined,
    });
  }

  /**
   * 订单筛选
   * 客户系统通过此接口向顺丰系统发送主动的筛单请求，用于判断客户的收、派地址是否属于顺丰的收派范围。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=923030
   * @param {*} data OrderFilter 参数 { filter_type, orderid, d_address! }
   */
  async orderFilter(data) {
    const serviceName = 'OrderFilter';
    return this.request(serviceName, {
      _attributes: {
        ...data,
        options: undefined,
      },
      OrderFilterOption: data.options ? { _attributes: data.options } : undefined,
    });
  }

  /**
   * 路由查询
   * 客户可通过此接口查询顺丰运单路由，系统将返回当前时间点已发生的路由信息。
   * 此路由查询接口支持两类查询方式：
   * 1）、根据运单号查询：系统将根据运单号与后台的月结卡号校验归属关系，系统只返回具有正确归属关系的运单路由信息。
   *   或者在参数check_phoneNo中传入运单对应的电话号码后4位（寄方或者收方电话都可以），系统将通过后端校验后，返回对应运单路由信息；
   * 2）、根据订单号查询：系统将根据接入编码与订单号，匹配对应的运单号，然后返回相关路由信息。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=893568
   * @param {*} data Route 参数 { tracking_type, tracking_number!, method_type, reference_number... }
   */
  async route(data) {
    const serviceName = 'Route';
    return this.request(serviceName, { _attributes: data });
  }

  /**
   * 子单号申请接口
   * 客户系统通过此接口向顺丰系统发送主动的筛单请求，用于判断客户的收、派地址是否属于顺丰的收派范围。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=759148
   * @param {*} data OrderZD 参数 { orderid, parcel_quantity }
   */
  async orderZD(data) {
    const serviceName = 'OrderZD';
    return this.request(serviceName, { _attributes: data });
  }
}

module.exports = {
  SFWL,
  SFError
};
