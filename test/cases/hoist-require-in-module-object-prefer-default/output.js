import _require_bar_ from "bar";
import _export_foo_ from "foo";
export {_export_foo_ as foo};
const _export_bar_ = () => _require_bar_;
export {_export_bar_ as bar};
