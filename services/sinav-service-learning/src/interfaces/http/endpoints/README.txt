Uç dosyaları: export default [ { method:'get', path:'/v1/...', permission: PERMISSIONS.x, handler: (req, caller) => container.useCases.<grup>.<fn>(...) } ]
container: import container from '../../../container.js'  (dairesel import güvenli: handler içinde çağrı anında kullan)
