module.exports = {
  importStyle(id) {
    if (id === "foo") {
      return new Promise(resolve => {
        setTimeout(resolve, 20, "default");
      });
    }
    return "named";
  }
};
