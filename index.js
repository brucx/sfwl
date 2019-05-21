const axios = require('axios');
const crypto = require('crypto');
const xmlJs = require('xml-js');
const querystring = require('querystring');

const log = (obj) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug(obj);
  }
};

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
  constructor({ clientCode, checkWord, endpoint = 'https://bsp-oisp.sf-express.com/bsp-oisp/sfexpressService' }) {
    this.endpoint = endpoint;
    this.clientCode = clientCode;
    this.checkWord = checkWord;
  }

  _generateVerifyCode(reqXML) { return crypto.createHash('md5').update(reqXML + this.checkWord).digest('base64'); }

  /**
   * xml 样例：
   * ```
   * <Request service="OrderService" lang="cn_ZH">
   *   <Head>BSPdevelop</Head>
   *   <Body>
   *     <Order orderid="TEST20180410001" express_type='1'
   *       j_province='广东省' j_city='深圳市' j_county='福田区' j_company='顺丰速运'
   *       j_contact='小丰' j_tel='95338' j_address='新洲十一街万基商务大厦'
   *       d_province='广东省' d_city='深圳市' d_county='南山区' d_company='顺丰科技'
   *       d_contact='小顺' d_tel='4008111111' d_address='学府路软件产业基地1栋B座' parcel_quantity='1'
   *       cargo_total_weight='1' custid='7551234567' pay_method='1' routelabelService='1'>
   *       <Cargo name='手机'></Cargo>
   *     </Order>
   *   </Body>
   * </Request>
   * ```
   *
   * @param {*} service
   * @param {*} data
   */
  _buildXML(service, data) {
    const bodyNameOfServices = {
      Route: 'RouteRequest',
      OrderReverse: 'Order',
      OrderRvsCancel: 'Order',
      CheckWorkDay: 'CheckWorkDayReq',
    };
    const bodyName = bodyNameOfServices[service] || service;
    const normalizedData = this._normalizeData(data);

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
          [bodyName]: normalizedData,
        },
      },
    };
    const result = xmlJs.js2xml(obj, { compact: true });
    return result;
  }

  /**
   * 将 object 转化成 compact 格式
   * @param {*} data
   */
  _normalizeData(data) {
    const obj = {};
    Object.keys(data).forEach((key) => {
      // 是原生类型
      if (['string', 'number'].indexOf(typeof data[key]) !== -1) {
        obj._attributes = Object.assign(obj._attributes || {}, { [key]: data[key] });
      }
      // 是对象
      if (data[key] instanceof Object) {
        obj[key.charAt(0).toUpperCase() + key.slice(1)] = this._normalizeData(data[key]);
      }
      // 是数组
      if (data[key] instanceof Array) {
        obj[key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, '')] = data[key].map(e => this._normalizeData(e));
      }
    });
    return obj;
  }

  _parseXML(service, data) {
    const bodyNameOfServices = {
      OrderSearch: 'Order',
    };
    const bodyName = bodyNameOfServices[service] || service;
    const result = xmlJs.xml2js(data, { compact: true });
    log({ _parseXML: { service, result } });
    const response = result.Response;
    if (response.ERROR) {
      const error = new SFError(response.ERROR._text);
      error.code = response.ERROR._attributes.code;
      return error;
    }
    return this._formatBody(response.Body[`${bodyName}Response`]);
  }

  _formatBody(data) {
    const obj = {};
    Object.keys(data).forEach((key) => {
      if (key === '_attributes') {
        Object.assign(obj, data[key]);
      } else if (Array.isArray(data[key])) {
        obj[key] = data[key].map(e => this._formatBody(e));
      } else if (typeof data[key] === 'object') {
        obj[key] = this._formatBody(data[key]);
      }
    });
    return obj;
  }

  async _request(service, data) {
    const xml = this._buildXML(service, data);
    log({ xml });
    const verifyCode = this._generateVerifyCode(xml);
    const response = await axios.post(this.endpoint, querystring.stringify({ xml, verifyCode }));
    log({ response: response.data });
    const result = this._parseXML(service, response.data);
    log({ result });
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
    return this._request(serviceName, data);
  }

  /**
   * 订单结果查询
   * 因Internet环境下，网络不是绝对可靠，用户系统下订单到顺丰后，不一定可以收到顺丰系统返回的数据，此接口用于在未收到返回数据时，查询下订单（含筛选）接口客户订单当前的处理情况。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=965417
   * @param {*} data OrderSearch 参数 { orderid!, search_type }
   */
  async orderSearch(data) {
    const serviceName = 'OrderSearch';
    return this._request(serviceName, data);
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
    return this._request(serviceName, data);
  }

  /**
   * 订单筛选
   * 客户系统通过此接口向顺丰系统发送主动的筛单请求，用于判断客户的收、派地址是否属于顺丰的收派范围。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=923030
   * @param {*} data OrderFilter 参数 { filter_type, orderid, d_address! }
   */
  async orderFilter(data) {
    const serviceName = 'OrderFilter';
    return this._request(serviceName, data);
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
    return this._request(serviceName, data);
  }

  /**
   * 子单号申请接口
   * 客户系统通过此接口向顺丰系统发送主动的筛单请求，用于判断客户的收、派地址是否属于顺丰的收派范围。
   * https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=902583&level4=759148
   * @param {*} data OrderZD 参数 { orderid, parcel_quantity }
   */
  async orderZD(data) {
    const serviceName = 'OrderZD';
    return this._request(serviceName, data);
  }

  /**
   * 是否工作日接口
   * 该接口用于客户系统查询是否工作日信息，
   * 丰桥上没有接口信息,需要向sf工作人员索要文档
   * @param {*} data CheckWorkDay 参数 { country_code!, lang_code!, media_code!,source_code!... }
   */
  async checkWorkDay(data) {
    const serviceName = 'CheckWorkDay';
    return this._request(serviceName, data);
  }

  /**
   * 退货下单（含筛单）接口
   * 下单接口根据客户需要，可提供以下三个功能：
   * 1)客户系统向顺丰下发订单。
   * 2)为订单分配运单号。
   * 3)筛单。
   * 丰桥上没有接口信息,需要向sf工作人员索要文档
   * @param {*} data OrderReverse 参数 { orderid!, express_type, j_company,j_contact!... }
   */
  async orderReverse(data) {
    const serviceName = 'OrderReverse';
    return this._request(serviceName, data);
  }

  /**
   * 退货消单接口
   * 此功能是完成退货消单功能.
   * 丰桥上没有接口信息,需要向sf工作人员索要文档
   * @param {*} data OrderRvsCancel 参数 { orderid! }
   */
  async orderRvsCancel(data) {
    const serviceName = 'OrderRvsCancel';
    return this._request(serviceName, data);
  }
}

module.exports = SFWL;
