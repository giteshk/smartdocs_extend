#!/usr/bin/env node
var fs = require('fs');
var yaml = require('js-yaml');

const[,, ...args] = process.argv;

var processed_objects = [];

function flatten_parameter_schema(openapi_spec, parameter_definition){
  return JSON.parse(JSON.stringify(openapi_spec['parameters'][parameter_definition.replace("#/parameters/", "")]));
}
function flatten_model_schema(openapi_spec, model_definition, skiplist = []){
  if(skiplist.indexOf(model_definition) > -1) {
    return {};
  }
  skiplist.push(model_definition);
  model_definition = model_definition.replace("#/definitions/", '');
  var keys = Object.keys(openapi_spec['definitions'][model_definition]['properties']);
  for(var i = 0; i< keys.length; i++){
    var $property = keys[i];
    if(openapi_spec['definitions'][model_definition]['properties'][$property]['$ref']) {
      var schema_name = openapi_spec['definitions'][model_definition]['properties'][$property]['$ref'];
      var flattened_schema = flatten_model_schema(openapi_spec, schema_name, skiplist);
      var description = null;
      if(openapi_spec['definitions'][model_definition]['properties'][$property]['description']) {
        description = openapi_spec['definitions'][model_definition]['properties'][$property]['description'];
      }
      openapi_spec['definitions'][model_definition]['properties'][$property] = flattened_schema;
      if(description != null){
        openapi_spec['definitions'][model_definition]['properties'][$property]['description'] = description;
      }
    }
  }
  return JSON.parse(JSON.stringify(openapi_spec['definitions'][model_definition]));
}

args.forEach(function (v){
  fs.readFile(v, 'utf8', function(err, contents) {
    var openapi_spec = {};
    try{
      openapi_spec = JSON.parse(contents);
    } catch(e){
      openapi_spec = yaml.safeLoad(contents);
    }
    path_keys = Object.keys(openapi_spec['paths']);
    //Fix parameters
    var parameter_keys = Object.keys(openapi_spec['parameters'])
    for(var i=0; i< parameter_keys.length;i++) {
      parameter = parameter_keys[i];

      //Add defaults to Enum fields
      if(!openapi_spec['parameters'][parameter]['example'] || !openapi_spec['parameters'][parameter]['default']){
        if(openapi_spec['parameters'][parameter]['enum']) {
          openapi_spec['parameters'][parameter]['example'] = openapi_spec['parameters'][parameter]['enum'][0];
        }
      }
    }

    //Fix Schemas definitions enum values
    var definitions_keys = Object.keys(openapi_spec['definitions'])
    for(var i=0; i< definitions_keys.length;i++) {
      definition = definitions_keys[i];
      var properties_keys = Object.keys(openapi_spec['definitions'][definition]['properties']);
      for(var j =0; j< properties_keys.length; j++) {
        var property =  properties_keys[j];
        //Add enum defaults
        var property_obj = openapi_spec['definitions'][definition]['properties'][property];
        if(!property_obj['example'] || !property_obj['default']){
          if(property_obj['enum']) {
            property_obj['example'] = property_obj['enum'][0];
          }
          if(property_obj['items'] && property_obj['items']['enum']) {
            property_obj['example'] = property_obj['items']['enum'][0];
          }
        }
      }
    }
    //Fix schema definitions with $ref directly on properties
    //Have to reloop because we want to ensure enum values are fixed correctly
    for(var i=0; i< definitions_keys.length;i++) {
      definition = definitions_keys[i];
      var properties_keys = Object.keys(openapi_spec['definitions'][definition]['properties']);
      for(var j =0; j< properties_keys.length; j++) {
        var property =  properties_keys[j];
        //Add enum defaults
        var property_obj = openapi_spec['definitions'][definition]['properties'][property];
        if(property_obj['$ref']){
          var description = null;
          if(property_obj['description']){
            description = property_obj['description'];
          }
          openapi_spec['definitions'][definition]['properties'][property] = flatten_model_schema(openapi_spec, property_obj['$ref'], []);
          if(description != null) {
            openapi_spec['definitions'][definition]['properties'][property]['description'] = description;
          }
        }
      }
    }

    //Fix the request parameters
    for(var i =0; i< path_keys.length; i++ ) {
      var path = path_keys[i];
      method_keys = Object.keys(openapi_spec['paths'][path]);
      for ( var j=0; j< method_keys.length; j++) {
        method = method_keys[j];
        var parameter_keys = Object.keys(openapi_spec['paths'][path][method]['parameters']);
        for( var parameter =0; parameter < parameter_keys.length; parameter++) {

            if (openapi_spec['paths'][path][method]['parameters'][parameter]['$ref']) {
              var schema_name = openapi_spec['paths'][path][method]['parameters'][parameter]['$ref'];
              var description = null;
              if(openapi_spec['paths'][path][method]['parameters'][parameter]['description']) {
                description = openapi_spec['paths'][path][method]['parameters'][parameter]['description'];
              }
              var parameter_definition = flatten_parameter_schema(openapi_spec, schema_name);
              openapi_spec['paths'][path][method]['parameters'][parameter] = parameter_definition;
              if (description != null) {
                openapi_spec['paths'][path][method]['parameters'][parameter]['description'] = description;
              }
            }
          }
        }
    }
    fs.writeFileSync(v + ".fixed", yaml.dump(openapi_spec));
  });
});
