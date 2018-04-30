import _require_foo_ from "foo";
import _require_bar_ from "bar";
export {_require_foo_ as foo};
const _export_bar_ = () => _require_bar_;
export {_export_bar_ as bar};
