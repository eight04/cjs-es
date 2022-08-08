let _export_foo_;
export {_export_foo_ as foo};
const _export_bar_ = _export_foo_ = "foo";
export {_export_bar_ as bar};
_export_foo_ = "bar";
