sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/zc2c/ist/zc2cist/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.zc2c.ist.zc2cist.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            var sHash = sap.ui.core.routing.HashChanger.getInstance().getHash();
            if (!sHash) {
                // replace=true so back button won’t return to empty route
                this.getRouter().navTo("PP_Wizard", {}, true);
            }
        }
    });
});