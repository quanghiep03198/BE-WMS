<h1 style="display: flex; justify-content: center; text-align-center; border: none">
		NestJS for Beginner
</h1>

## Nội dung chính

- [Mục tiêu](#mục-tiêu)
- [Một số khái niệm cần nắm được](#một-số-khái-niệm-cần-nắm-được)
   - [Decorator](#decorator)
   - [Dependency Injection](#dependency-injection)
- [Tìm hiểu về NestJS](#tìm-hiểu-về-nestjs)
   - [Life cycle trong NestJS](#1-life-cycle-trong-nestjs)
   - [Các Components quan trọng](#2-các-components-quan-trọng)
      - [Middleware](#12-middleware)
      - [Guard](#12-guard)
      - [Interceptor](#13-interceptor)
      - [Pipes](#14-pipes)
      - [Exception Filter](#15-exception-filter)
   - [Mô hình Package By Feature](#3-mô-hình-package-by-feature)

## Mục tiêu

Tài liệu này cung cấp cho thành viên trong dự án có kiến thức tổng quan về NestJS, nắm rõ được các component quan trọng trong NestJS. Đồng thời các thành viên trong dự án cũng có thể nắm bắt và tiếp cận base, mô hình kiến trúc dự án một cách nhanh chóng, qua đó góp phần xúc tiến quá trình phát triển.

## Một số khái niệm cần nắm được

- Decorator: _Là một function đặc biệt được dùng để thay đổi hoặc mở rộng hành vi của class, method, property hoặc parameter trong TypeScript. Decorator cho phép chúng ta thêm chức năng mới mà không cần sửa đổi code ban đầu của class._

- Dependency Injection: _Dependency Injection (DI) là một kỹ thuật trong lập trình giúp quản lý các phụ thuộc (dependencies) của một class. Thay vì tự tạo hoặc quản lý các đối tượng mà class cần, DI sẽ cung cấp các đối tượng đó từ bên ngoài. Điều này giúp code dễ bảo trì, kiểm thử và mở rộng hơn._

   Trong NestJS, DI được sử dụng rộng rãi để quản lý các service, repository, và các thành phần khác. Khi một class cần một phụ thuộc, nó sẽ yêu cầu thông qua constructor, và NestJS sẽ tự động cung cấp các phụ thuộc đó.

   Ví dụ đơn giản về DI trong NestJS:

   ```typescript
   @Injectable()
   class UserRepository {
   	// Inject data source
   	getUser(): string {
   		return database.query(`SELECT * FROM users`)
   	}
   }

   @Injectable()
   class UserService {
   	constructor(private readonly userRepository: UserRepository) {}

   	getUser(): string {
   		return this.userRepository.getUser()
   	}
   }
   ```

   Trong ví dụ này:

   - `UserRepository` là layer để tương tác với database và lấy dữ liệu về "user"
   - `UserService` là layer để xử lý logic với thông tin user, tuy nhiên nó phụ thuộc vào UserRepository và nhận nó thông qua constructor. NestJS sẽ tự động tạo và cung cấp UserRepository khi UserService được khởi tạo.

   Hy vọng giải thích này giúp bạn hiểu rõ hơn về Dependency Injection!

### Tìm hiểu về NestJS

**1. Life cycle trong NestJS**

![NestJS Lifecycle](/docs/@framework/nestjs-life-cycle.png)

_Hình ảnh trên sẽ đem lại cho bạn cái nhìn tổng quan về luồng chạy của 1 request trên ứng dụng Rest API với NestJS._

Tiếp theo chúng ta sẽ tiếp tục tìm hiểu chi tiết về các Component đã được đề cập tới.

**2. Các Components quan trọng**

NestJS cung cấp cho chúng ta nhiều thành phần hữu ích như **Middleware**, **Guards**, **Interceptors**, **Pipe**, **Filter**... Việc sử dụng các thành phần đó được NestJS tinh giản nên hầu như rất dễ sử dụng, vì thế đôi khi trong quá trình sử dụng chúng ta thường bỏ qua cách mà NestJS xử lý 1 request khi đi qua các thành phần trên. Để tận dụng tối đa sức mạnh của NestJS, chúng ta cần hiểu rõ về các thành phần đó và cách thức mà nó xử lý các request hay thứ tự mà các thành phần đó được gọi. Bằng cách tìm hiểu các thông tin trên, chúng ta có thể tối ưu hóa ứng dụng của mình và đạt được hiệu quả cao nhất cũng như tránh các lỗi không mong muốn trong quá trình lập trình. Hãy cùng mình khám phá và hiểu về thứ tự mà NestJS thực thi các bước trong lifecycle của một request để hiểu rõ hơn về framework này. Đồng thời chúng ta cũng sẽ tìm hiểu đôi nét về chức năng và cách ứng dụng các thành phần mà NestJS đã cung cấp.

**1.1. Middleware**

Middleware được gọi đầu tiên khi request đến server, chúng ta thường dùng để xử lý và thay đổi thông tin request trước khi truyền đến route handler. Đây là thành phần đầu tiên được gọi nên thông thường khi cấu hình dự án chúng ta sẽ sử dụng chúng đầu tiên. Có 2 loại Middleware chính:

- Global Bound Middleware: Middleware được đăng ký global trên toàn ứng dụng của chúng ta và sẽ được áp dụng cho tất cả các request được gửi đến. Chúng ta thường thấy khi sử dụng các package như **cors**, **helmet**, **body-parser**,... với cú pháp `app.use()` (ở đây `app` là instance app được khởi tạo ở file `main.ts`)
- Module Bound Middleware: Middleware được đăng ký cho từng module thực thi tính năng cụ thể, có thể chỉ định chính xác được các Endpoint nào sẽ được áp dụng Middleware này.

**1.2 Guard**

Là thành layer kế tiếp sẽ thực thi sau khi pass qua Middleware, Guard nhờ vào việc có thể truy cập vào **ExcecutionContext** instance nên có thể biết được handler nào tiếp theo sẽ được gọi sau khi gọi hàm next( ). Việc sử dụng Guard giúp chúng ta đưa logic xử lý vào chu trình của ứng dụng một cách rõ ràng và dễ hiểu. Điều này giúp cho code của chúng ta trở nên ngắn gọn, dễ đọc và dễ bảo trì hơn, đồng thời giúp giảm thiểu các lặp lại trong code (DRY). Từ đó, ứng dụng có thể được phát triển và nâng cấp một cách dễ dàng và hiệu quả hơn. Tường hợp sử dụng phổ biến nhất cho **Guard** chính là chức năng Authentication/Authorization

**1.3 Interceptor**

Interceptors cho phép chúng ta xử lý các request và response trước khi chúng được xử lý bởi controller hoặc được trả về cho client. Vì thế chúng ta có thể chèn thêm custom logic vào quá trình xử lý request/response của ứng dụng. Interceptors thường được sử dụng cho các trường hợp sau đây:

- Logging: Ghi lại thông tin request và response để giám sát và phân tích
- Caching: Lưu cache của các response để giảm thiểu việc truy vấn database hoặc service bên ngoài
- Transformation: Chuyển đổi request hoặc response để phù hợp với định dạng mong muốn

Vì Interceptors xử lý cả request lẫn response nên sẽ có 2 phần (mindset khá giống interceptor của Axios):

- Pre: trước khi đến method handler của controller
- Post: sau khi có response trả về từ method handler.

Interceptor cũng có các _Scope_ thực thi khác nhau:

- Global Scope: Interceptor sẽ được sử dụng trong toàn bộ ứng dụng, tất cả các request gửi đến ứng dụng API sẽ đều thực thi interceptor này.

- Controller Scope: Khi 1 Controller được gắn apply 1 Interceptor thì chỉ những Endpoint thuộc Controller này mới áp dụng Interceptor đã gắn. Trường hợp sử dụng phổ biến đó là hợp bạn muốn áp dụng Cache Response trả về cho Front-end đối với toàn bộ routes thuộc 1 Controller, lúc này sử dụng Interceptor với scope Controller sẽ rất hữu dụng

- Route Scope: Nếu bạn muốn chỉ sử dụng Interceptor với mỗi Endpoint được chỉ định trong controller, bạn có thể sử dụng decorator để apply Interceptor cho riêng method đó trong Controller

**1.4 Pipes**

Mục đích chính của Pipe là để kiểm tra, chuyển đổi và/hoặc sàng lọc dữ liệu được gửi và nhận về từ client.

Các trường hợp khi nên sử dụng Pipe bao gồm:

- Xác thực dữ liệu: Kiểm tra xem dữ liệu được gửi từ client có đúng định dạng và có hợp lệ hay không (Validate payload body, request query params,...).
- Chuyển đổi dữ liệu: Chuyển đổi định dạng dữ liệu được gửi từ client thành dạng dữ liệu mà server có thể hiểu được, hoặc ngược lại chuyển đổi định dạng dữ liệu gửi về cho client.
- Sàng lọc dữ liệu: Lọc bỏ dữ liệu không cần thiết, nhạy cảm hoặc nguy hiểm.

Pipe cũng có 4 scope khác nhau:

- Global Pipe: được sử dụng trong toàn bộ ứng dụng, thường được dùng để validate các trường config trong file biến môi trường `.env`

- Controller Pipes: Định nghĩa trong phạm vi Controller, tất cả method trong Controller đều được áp dụng Pipe, trường hợp này thường ít sử dụng hơn

- Route Pipe & Route Parmeter Pipe: Điểm chung là đều sử dụng Pipe cho riêng 1 method trong Controller, tuy điểm khác biệt là ở vị trí đặt Pipe, nếu decorator Pipe được đặt bên trên method, tức là toàn bộ các thành phần như Body, Query, Request Param đều sẽ sử dụng Pipe đã apply (trong trường hợp chỉ request đơn giản, điều này là chấp nhận được). Còn Route Parmeter Pipe, Pipe sẽ được đặt bên trong decorator, và chỉ xử lý logic pipe riêng cho thành phần được gán pipe. Cùng xem ví dụ dưới đây để có thể hiểu rõ hơn

```typescript
@Controller()
export class SampleController {
	@Get()
	@UsePipes(new ZodValidationPipe(sampleDTO))
	routePipeSample(
		@Body() payload
		// @Query() queryParams,
	) {
		/*
         Lưu ý trường hợp bạn sử dụng cả @Body và @Query thì cả 2 sẽ cùng bị validate với sampleDTO và có thể dẫn đến lỗi không mong muốn.
         Nếu bạn chỉ validate duy nhât "payload" thì cách này ok
      */
	}

	@Get()
	@UsePipes()
	routeParamPipeSample(
		@Body(new ZodValidationPipe(samplePayloadDTO)) payload,
		@Query(new ZodValidationPipe(sampleQueryDTO)) queryParams
	) {
		/*
         Ở đây, nếu bạn muốn validate cho từng thành phần riêng biệt, nên sử dụng Route Parameter Pipe
      */
	}
}
```

**1.5 Exception Filter**

Khác với Express thuần, khi gặp exceptions ứng dụng sẽ bị crash,Exception filter được NestJS tạo ra để xử lý các ngoại lệ (exceptions) trong ứng dụng. Nó giúp chúng ta kiểm soát và định hướng các ngoại lệ xảy ra trong ứng dụng và trả về một phản hồi thích hợp cho user. Nếu các exceptions không được chúng ta tự handle thì sẽ được chuyển đến cho Exception Filter xử lý mà hoàn toàn không cần lặp lại try/catch nhiều lần trên ứng dụng. Ví dụ triển khai 1 Exception Filter:

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
	constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

	catch(exception: HttpException | Error, host: ArgumentsHost): void {
		const { httpAdapter } = this.httpAdapterHost
		const ctx = host.switchToHttp()
		const httpStatus = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
		const responseBody: IResponseBody = {
			message: exception.message,
			statusCode: httpStatus,
			stack: exception.stack,
			timestamp: new Date().toISOString(),
			path: httpAdapter.getRequestUrl(ctx.getRequest())
		}
		if (httpStatus === HttpStatus.INTERNAL_SERVER_ERROR) FileLogger.error(exception)
		httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus)
	}
}

// sample.controller.ts
@Controller
export class SampleController {
	@Get()
	@UseFilters(AllExceptionFilter)
	sampleFilter() {
		throw new Error('Oopps !!! Something went wrong')
		// {
		// 	message: 'Oopps !!! Something went wrong',
		// 	statusCode: 500,
		//    ...
		// }
	}
}
```

**3. Mô hình Package By Feature**

Trong kiến trúc đa tầng, lập trình viên sẽ viết code và liên kết chúng tương ứng với từng tầng của ứng dụng. Chúng ta có thể gọi cách tiếp cận đó là package by layer - dịch sơ là dựng package theo tầng (layer). Dưới đây là một ví dụ về cấu trúc thư mục của một dự án ExpressJS theo mô hình package by layer:

```
/project-root
|-- /src
|   |-- /controllers
|   |   |-- userController.js
|   |   |-- productController.js
|   |
|   |-- /services
|   |   |-- userService.js
|   |   |-- productService.js
|   |
|   |-- /repositories
|   |   |-- userRepository.js
|   |   |-- productRepository.js
|   |
|   |-- /models
|   |   |-- userModel.js
|   |   |-- productModel.js
|   |
|   |-- /middlewares
|   |   |-- authMiddleware.js
|   |   |-- errorMiddleware.js
|   |
|   |-- /routes
|   |   |-- userRoutes.js
|   |   |-- productRoutes.js
|   |
|   |-- /config
|   |   |-- dbConfig.js
|   |   |-- appConfig.js
|   |
|   |-- app.js
|   |-- server.js
|
|-- /tests
|   |-- userController.test.js
|   |-- productController.test.js
|
|-- package.json
|-- README.md
```

Trong cấu trúc này:

- **controllers**: Chứa các file điều khiển (controller) xử lý các request và response.
- **services**: Chứa các file dịch vụ (service) xử lý logic nghiệp vụ.
- **repositories**: Chứa các file repository để tương tác với cơ sở dữ liệu.
- **models**: Chứa các file mô hình (model) định nghĩa cấu trúc dữ liệu.
- **middlewares**: Chứa các file middleware để xử lý các logic trung gian.
- **routes**: Chứa các file định nghĩa các route của ứng dụng.
- **config**: Chứa các file cấu hình của ứng dụng.
- **app.js**: File khởi tạo ứng dụng Express.
- **server.js**: File khởi động server.
- **tests**: Chứa các file test cho ứng dụng.

Cấu trúc này giúp tách biệt rõ ràng các thành phần của ứng dụng theo từng tầng, giúp dễ dàng quản lý và bảo trì.

Vấn đề của cách tiếp cận này là sự ràng buộc giữa các tầng (cụ thể hơn là các package) quá chặt chẽ, dẫn đến vận hành, bảo trì và thay đổi các component gặp nhiều khó khăn. Đây không phải là điều chúng ta mong muốn. Mặt khác, nhiều người vẫn muốn chia tách các khía cạnh (concerns) của project một cách rạch ròi(presentation, application, domain và infrastructure).

Vậy làm thế nào để vừa chia tách được các khía cạnh theo từng tầng, vừa khống chế được sự ràng buộc giữa các tầng đó ở mức nhỏ nhất?

Đó là lúc Package by Feature - dựng package theo tính năng ra đời. Package by Feature bao gồm cả việc phân tầng và xử lý các ràng buộc một cách hợp lý. Cụ thể: theo tư tưởng này, việc phân tầng sẽ được tiến hành ở mức "thấp hơn" - mức class. Việc xử lý các ràng buộc được đẩy lên mức cao hơn class. Như vậy, các class liên quan tới cùng một tính năng sẽ nằm cùng nhau. Ví dụ về 1 project được triển khai theo kiến trúc Package By Feature

```
/project-root
├── src/
│   ├── common/ Module Common chứa các Component sử dụng trong xuyên suốt dự án
│   │   ├── constants/
│   │   ├── decorators/
│   │   ├── filters/
│   │   ├── helpers/
│   │   ├── interceptors/
│   │   ├── pipes/
│   │   ├── types/
│   │   ├── interceptors/
│   │   └── utils/
│   ├── configs/
│   │   ├── app.config.ts
│   │   └── app.config.validator.ts
│   ├── databases/
│   │   └── database.module.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.guard.ts
│   │   │   └── user.module.ts
│   │   ├── users/
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.repository.ts
│   │   │   └── user.module.ts
│   │   └── ... // Các Features khác sẽ được đóng gói vào từng folder với tên tương ứng
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── main.ts
│   └── ...
├── .env.example
├── ecosystem.config.js
├── package.json
└── ...
```

Khái niệm feature - tính năng ở đây mang nghĩa tổng quát, feature có thể chỉ là một use case đơn giản hoặc là cả một tập hợp các quy trình phục vụ cho một logic xử lý cụ thể.
