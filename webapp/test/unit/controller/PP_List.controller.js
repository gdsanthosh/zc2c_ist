/*global QUnit*/

sap.ui.define([
	"com/zc2c/ist/zc2cist/controller/PP_List.controller"
], function (Controller) {
	"use strict";

	QUnit.module("PP_List Controller");

	QUnit.test("I should test the PP_List controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
