const { Sequelize, DataTypes } = require('sequelize');

// Existing SQLite schema remains authoritative; never sync({ force/alter }).
function createModels(storage) {
  const sequelize = new Sequelize({ dialect: 'sqlite', storage, logging: false });
  const fields = (names, type) => Object.fromEntries(names.split(' ').map(name => [name, type]));
  const Product = sequelize.define('Product', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ...fields('slug name short_desc description image tags badge badge_style created_at', DataTypes.TEXT),
    ...fields('category_id price old_price review_count calories prep_minutes sort', DataTypes.INTEGER),
    rating: DataTypes.FLOAT, is_available: DataTypes.BOOLEAN,
  }, { tableName: 'menu_items', timestamps: false });
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ...fields('code customer_name phone order_type address notes payment_method promo_code status created_at updated_at', DataTypes.TEXT),
    ...fields('subtotal discount delivery_fee total', DataTypes.INTEGER),
  }, { tableName: 'orders', timestamps: false });
  const OrderItem = sequelize.define('OrderItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ...fields('order_id menu_item_id price qty', DataTypes.INTEGER), name: DataTypes.TEXT,
  }, { tableName: 'order_items', timestamps: false });
  Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'items' });
  OrderItem.belongsTo(Product, { foreignKey: 'menu_item_id', as: 'product' });
  return { sequelize, Product, Order, OrderItem };
}
module.exports = { createModels };
