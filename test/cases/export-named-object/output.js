const bak = "bak";

const _export_foo_ = "foo";
export {_export_foo_ as foo};
const _export_bar_ = function () {};
export {_export_bar_ as bar};
const _export_baz_ = function* () {};
export {_export_baz_ as baz};
export {bak};
