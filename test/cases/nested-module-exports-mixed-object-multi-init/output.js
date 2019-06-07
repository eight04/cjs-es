let _export_foo_;
export {_export_foo_ as foo};
_export_foo_ = () => "FOO";
_export_foo_ = () => "BAR";
