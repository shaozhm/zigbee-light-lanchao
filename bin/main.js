#!/usr/bin/env node
const mqtt = require('mqtt');
const Path = require('path');
const Fs = require('fs');
const { _: Lodash } = require('lodash');
const {
  read,
} = require('../src/yaml');

const DEFAULT_CONFIGFILE = 'config.yaml';
const configPath = Path.join('.', 'config', DEFAULT_CONFIGFILE);
console.log('Read Config: ', configPath);

if (!Fs.existsSync(configPath)) {
  console.error(`The ${DEFAULT_CONFIGFILE} file doesn't exist in ./config`);
}

const config = read(configPath);

const {
  address,
  port,
  topics,
} = config;

console.log("Creating new MQTT client for url: ", address);
const client = mqtt.connect(`mqtt://${address}:${port}`);
client.on('error', function(error) {
  console.log('*** MQTT JS ERROR ***: ' + error);
});

client.on('offline', function() {
  console.log('*** MQTT Client Offline ***');
  client.end();
});

topics.forEach((topic) => {
  client.subscribe(`${topic}`);
  console.log(`subscribed ${topic}`);
})

// 厨房的全局变量定义
let disableSensor1 = false;
let keepLight1 = true;

// 厕所的全局变量定义
let disableSensor2 = false;
let keepLight2 = false;
let door2contact = false;
let waterLeak = false;

client.on('message', function(topic, message) {
  console.log(`[${topic}] message: `, message.toString());
  console.log(`KeepLight-1/Disable Sensor 1: `, keepLight1, disableSensor1);
  console.log(`KeepLight-2/Disable Sensor 2: `, keepLight2, disableSensor2);
  if (topic.startsWith('zigbee2mqtt')) {
    const mesgJSON = JSON.parse(message.toString());
    const checkTopicProperty = (topicEndString, property) => topic.endsWith(topicEndString) && Lodash.isObject(mesgJSON) && Lodash.has(mesgJSON, property) && !Lodash.isNil(mesgJSON[property]);

    // 延迟开启厨房人体红外感应器
    const fnDisableSensor1Off = () => {
      if (!keepLight1) {
        disableSensor1 = false;
        console.log(`Disable Sensor 1 set to: `, disableSensor1);
      }
    };

    // 厨房门口主开关
    if (checkTopicProperty('ikea-styrbar-white-c-1', 'action')) {
      if (mesgJSON.action === 'on') {
        keepLight1 = true;
        disableSensor1 = true;
        console.log(`Disable Sensor 1 set to: `, disableSensor1);
      }
      if (mesgJSON.action === 'off') {
        keepLight1 = false;
        setTimeout(fnDisableSensor1Off, 3000);
      }
    }

    // 厨房的副开关
    if (checkTopicProperty('ikea-tradfri-1', 'action')) {
      if (mesgJSON.action === 'on') {
        client.publish('zigbee2mqtt/kitchen/set', '{ "state": "ON" }', { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
        keepLight1 = true;
        disableSensor1 = true;
        console.log(`Disable Sensor 1 set to: `, disableSensor1);
      }
      if (mesgJSON.action === 'off') {
        client.publish('zigbee2mqtt/kitchen/set', '{ "state": "OFF" }', { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
        keepLight1 = false;
        setTimeout(fnDisableSensor1Off, 3000);
      }
    }

    // 厨房的人体红外感应器
    if (checkTopicProperty('sensor-1', 'occupancy') && !disableSensor1) {
      const sendMesg = mesgJSON.occupancy ? '{ "state": "ON" }' :  '{ "state": "OFF" }';
      const topic = mesgJSON.occupancy ? 'zigbee2mqtt/hue-bulbs-c/set' : 'zigbee2mqtt/kitchen/set';
      console.log(`Send Topic: ${topic}, Message: ${sendMesg}`);
      client.publish(topic, sendMesg, { qos: 0, retain: false }, (error) => {
        if (error) {
          console.error(error)
        }
      })
    }

    // 厨房的门感应器
    if (checkTopicProperty('door-1', 'contact') && !mesgJSON.contact) {
      client.publish('zigbee2mqtt/hue-bulbs-c/set', '{"state": "ON"}', { qos: 0, retain: false }, (error) => {
        if (error) {
          console.error(error)
        }
      })
    }
    
    // 主卧的床前总控开关
    if ((topic.endsWith('button-1') || topic.endsWith('button-2')) && mesgJSON) {
      const { action } = mesgJSON;
      const sendMesg = action === 'single' ? '{"state": "ON"}' : action === 'double' || action ==='triple' || action === 'quadruple' ? '{"state": "OFF"}' : null
      if (sendMesg) {
        client.publish('zigbee2mqtt/kitchen/set', sendMesg, { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
        client.publish('zigbee2mqtt/bedroom/set', sendMesg, { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
        client.publish('zigbee2mqtt/ikea-led-strip-driver-3/set', sendMesg, { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
      }
    }

    // keepLight变量: 表示目前希望开/关灯，但关灯会延迟几秒再执行，当延迟时间到时，执行前需检测 keepLight 变量是否还是 false. 
    // 到那时如果还是 false 则需要关灯，否则不需要执行。

    // 延迟开启厕所的人体红外感应器
    const fnDisableSensor2Off = () => {
      if (!keepLight2) {
        disableSensor2 = false;
        console.log(`Disable Sensor 2 set to: `, disableSensor2);
      }
    };

    // 厕所的主开关
    if (checkTopicProperty('ikea-styrbar-white-c-3', 'action')) {
      if (mesgJSON.action === 'on') {
        keepLight2 = true;
        disableSensor2 = true;
        console.log(`Disable Sensor 2 set to: `, disableSensor2);
      }
      if (mesgJSON.action === 'off') {
        keepLight2 = false;
        setTimeout(fnDisableSensor2Off, 3000);
      }
    }

    // 厕所的门感应器
    if (checkTopicProperty('door-2', 'contact')) {
      door2contact = mesgJSON.contact;
      console.log('door-2 contact', door2contact);
      if (door2contact) {
        // 如果门关着，人体红外感应器要停止检测。
        keepLight2 = true;
        disableSensor2 = true;
      } else if (!waterLeak) {
        // 如果门开启，水浸检测器没有检测到水，说明没人在洗澡，需要开启人体红外感应器。
        keepLight2 = false;
        disableSensor2 = false;
      }
      keepLight2 = mesgJSON.contact;
      disableSensor2 = mesgJSON.contact;
      console.log(`Disable Sensor 2 set to: `, disableSensor2);
    }

    // 厕所的人体红外感应器
    if (checkTopicProperty('sensor-3', 'occupancy') && !disableSensor2) {
      const sendMesg = mesgJSON.occupancy ? '{ "state": "ON" }' :  '{ "state": "OFF" }';
      const topic = 'zigbee2mqtt/ikea-led-strip-driver-3/set';
      console.log(`Send Topic: ${topic}, Message: ${sendMesg}`);
      client.publish(topic, sendMesg, { qos: 0, retain: false }, (error) => {
        if (error) {
          console.error(error)
        }
      })
    }

    // 厕所的水浸检测器
    if (checkTopicProperty('water-leak-1', 'water_leak')) {
      waterLeak = mesgJSON.water_leak;
      console.log('Water Leak: ', waterLeak);
      if (waterLeak) {
        // 如果水浸检测器检测到水，说明在洗澡，人体红外感应器要停止检测。
        keepLight2 = true;
        disableSensor2 = true;

        const topic = 'zigbee2mqtt/ikea-led-strip-driver-3/set';
        // 开灯
        client.publish(topic, '{ "state": "ON" }', { qos: 0, retain: false }, (error) => {
          if (error) {
            console.error(error)
          }
        })
      } else if (!door2contact) {
        // 如果水浸检测器检测到没水，说明洗澡结束，需要查看厕所门是否在打开状态，如果门在打开状态，需要开启人体红外感应器。
        keepLight2 = false;
        disableSensor2 = false;
      }
      console.log(`Disable Sensor 2 set to: `, disableSensor2);
    }
  }
});
