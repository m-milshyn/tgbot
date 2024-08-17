FROM node:18-alpine
RUN rm -rf /home/app
RUN mkdir /home/app
WORKDIR /home/app
COPY . .
RUN yarn install