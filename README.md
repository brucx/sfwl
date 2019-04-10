# sfwl ![NPM version](https://badge.fury.io/js/sfwl.png)
顺丰物流 Node SDK

[API接口列表](https://qiao.sf-express.com/pages/developDoc/index.html?level2=296618&level3=890150&level4=973438)

```JS
const SFWL = require('sfwl').SFWL;

const sfwl = new SFWL({ clientCode: 'ABCDEF', checkWord: 'asdf1234' });

sfwl.order({
  orderid: 'test12345woody01',
  is_gen_bill_no: 1,
  j_company: '小木屋',
  j_contact: '胡迪测试',
  j_tel: '15500001111',
  j_address: '北京市海淀区海淀路19-1中成大厦1109',
  d_company: '测试公司',
  d_contact: '测试收件人',
  d_tel: '15511110000',
  d_address: '广东省深圳市南山区科技中二路深圳软件园一期7-305',
  pay_method: 2,
  cargos: [{
    name: 'Foo',
    count: 1,
    unit: 'Box',
    weight: 3.112,
    amount: 90.999,
    currency: 'USD',
    source_area: 'US'
  }, {
    name: 'Bar',
    count: 1,
    unit: 'Piece',
    weight: 1.433,
    amount: 12.999,
    currency: 'USD',
    source_area: 'US'
  }]
}).then(res => console.log(JSON.stringify(res)));
sfwl.orderSearch({ orderid: 'test12345woody01', search_type: 1 }).then(res => console.log(JSON.stringify(res)));
sfwl.route({ tracking_number: 'test12345woody01', tracking_type: 2 }).then(res => console.log(JSON.stringify(res)));
```

## 接口规范说明

1. 报文及报文编码

丰桥API统一使用UTF-8编码的XML报文。
丰桥API使用ORACLE数据库，以UTF-8编码形式保存数据，所以中文字符会在数据库中占varchar2类型的三个单位长度。例如，接口定义中的“类型（约束）”如果为String(100)，则表示对于此字段，如果字段值全部为中文汉字，只能保存33个单位。

2. 通讯协议

接口通信协议支持WEBSERVICE及HTTP/POST协议：
1) 当使用WEBSERVICE接口时，报文通过方法参数传入（两个参数分别为XML报文及校验码）。
2) 当使用HTTP/POST接口时，通过一个名叫xml的参数传入XML报文，一个名叫verifyCode的参数传入校验码。
其中校验码的生成规则为：
• 接入API前，丰桥系统会为每个接入客户分配一个“密钥”，以下把密钥简称为checkword。
• 按以下逻辑生成校验码：
o 先把XML报文与checkword前后连接。
o 把连接后的字符串做MD5编码(用二进制格式存储）。
o 把MD5编码后的数据进行Base64编码，此时编码后的字符串即为校验码。
提示：MD5报文摘要以16字节长度的原始二进制格式返回

3. 接口规范说明

3.1. 接口基本信息说明
以下表为例：

|  |  |
| --- | --- |
| 服务名称 | OrderService |
| 批量交易 | 不支持  |
| 接口类型 | 接入 |
| 接口方法 | String sfexpressService(String xml, String verifyCode) |

1) 服务名称：此接口的服务名称。
2) 批量交易：此接口是否支持批量交易，若支持，则会说明所支持的元素/元素属性。
3) 接口类型：丰桥API分为接入与推送两类接口。
4) 接口方法：此接口的方法。
3.2. XML报文说明
丰桥API使用的XML报文需要遵循以下格式与规则：
• 请求XML报文：
o service 属性与Head元素预先定义了“服务名”及“顾客编码”。
o “顾客编码”统一由顺丰丰桥系统分配。
o lang属性用于定义响应报文的语言，缺省值为zh-CN，目前支持以下值zh-CN表示中文简体，zh-TW或zh-HK或zh-MO表示中文繁体，en表示英文。

```XML
<?xml version="1.0" encoding="UTF-8"?>
<Request service="服务名" lang="zh-CN">
<Head>顾客编码</Head>
<Body>请求数据XML</Body>
</Request>
```

• 响应XML报文：
o Head元素值为OK或ERR；OK代表交易成功，ERR代表发生系统或业务异常，交易失败；对于批量交易场景，只能为成功/失败，无部分成功/部分失败，只要存在有未成功接收的信息即认为为失败。
o Head元素值为OK时只返回Body元素，为ERR时只返回Error元素，Body与Error元素不能同时存在。
o Error元素中的code属性值为四位数字，错误编码的描述请参考附录《原因代码表》。

```XML
<?xml version="1.0" encoding="UTF-8"?>
<Response service="服务名">
<Head>OK|ERR</HEAD>
<Body>正常响应数据XML</Body>
<ERROR code="NNNN">错误详细信息</ERROR>
</Response>
```

• 扩展字段
o 个别接口存在扩展字段，扩展字段使用数据元素下保留元素<Extra>的属性进行定义。
o 字段的数目最多支持20个，超过20个的部分将被忽略。
o 属性名为e1,…,e20，只支持字符串值。

```XML
<Order id="XXXX" …>
    <Extra e1="XXXX" …/>
</Order>
```

3.3. 元素及元素属性说明
以下表为例：

| # | 属性名 | 类型（约束） | 必填 | 默认值 | 描述 |
| --- | --- | --- | --- | --- | --- |
| 1 | orderid | String(64) | 是 |  | 客户订单号 |

元素<请求>Order

1) 元素标题，其中<请求>表示此元素属于请求XML报文中的元素，同样<响应>表示其属于响应XML报文中的元素，Order表示此元素的名称，元素名称后若带“（可选）“代表此元素在XML报文中为可选的元素。
2) 属性名：属于此元素的属性名称，元素的属性也称字段。
3) 类型（约束）：表示此属性的数据类型，包括：
o String(n)：n代表字节长度（中文汉字占3字节）。
o Number(m,n)：m代表总有效数字的位数，n代表小数点后的有效数字的位数。
o Date：代表日期，格式为YYYY-MM-DD HH24:mm:SS。
4) 必填：表示此属性是否必填，包括：
o 是：此属性为必填。
o 否：此属性为非必填。
o 条件：此属性在某条件下为必填，在描述中会对此说明。
5) 默认值：属性的默认值，如果接口定义中字段默认值标记有 “_SYSTEM”，则表示这个字段可由顺丰内部为客户配置。
6) 描述：此属性的意义，用途及注意事项的说明。
