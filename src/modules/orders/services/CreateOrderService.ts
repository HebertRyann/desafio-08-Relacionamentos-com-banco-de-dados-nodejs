import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) { }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExist = await this.customersRepository.findById(customer_id);

    if (!customerExist) {
      throw new AppError('This customer does not exists');
    }

    const producstExist = await this.productsRepository.findAllById(products);
    if (!producstExist.length) {
      throw new AppError('could not find any products with given ids');
    }
    const productsIds = producstExist.map(product => product.id);

    const filterInexistentProduct = products.filter(
      product => !productsIds.includes(product.id),
    );

    if (filterInexistentProduct.length) {
      throw new AppError(
        `could not find product ${filterInexistentProduct[0].id}`,
      );
    }

    const findProductWithNoAvailabeQuantity = products.filter(
      product =>
        producstExist.filter(productExist => productExist.id === product.id)[0]
          .quantity < product.quantity,
    );

    if (findProductWithNoAvailabeQuantity.length) {
      throw new AppError(
        `the quantity ${findProductWithNoAvailabeQuantity[0].quantity} is not available for ${findProductWithNoAvailabeQuantity[0].id}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: producstExist.filter(
        productExist => productExist.id === product.id,
      )[0].price,
    }));
    const order = await this.ordersRepository.create({
      customer: customerExist,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderUpdatedProductQuantity = order_products.map(product => ({
      id: product.product_id,
      quantity:
        producstExist.filter(
          productExist => productExist.id === product.product_id,
        )[0].quantity - product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderUpdatedProductQuantity);

    return order;
  }
}

export default CreateOrderService;
