import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/src/App.jsx");import __vite__cjsImport0_react_jsxDevRuntime from "/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=c04bafe3"; const jsxDEV = __vite__cjsImport0_react_jsxDevRuntime["jsxDEV"];
var _s = $RefreshSig$();
import { HashRouter, Navigate, Route, Routes } from "/node_modules/.vite/deps/react-router-dom.js?v=c04bafe3";
import AppLayout from "/src/layout/AppLayout.jsx";
import ClientsPage from "/src/pages/ClientsPage.jsx";
import DashboardPage from "/src/pages/DashboardPage.jsx";
import FinancePage from "/src/pages/FinancePage.jsx";
import OrdersPage from "/src/pages/OrdersPage.jsx";
import ProductsPage from "/src/pages/ProductsPage.jsx";
import PurchasesPage from "/src/pages/PurchasesPage.jsx";
import SettingsPage from "/src/pages/SettingsPage.jsx";
import StockPage from "/src/pages/StockPage.jsx";
import useClientsState from "/src/state/useClientsState.js";
import useOrdersState from "/src/state/useOrdersState.js";
import useProductsState from "/src/state/useProductsState.js";
import usePurchasesState from "/src/state/usePurchasesState.js";
import useSuppliersState from "/src/state/useSuppliersState.js";
function App() {
  _s();
  const { suppliers, upsertSupplier, deleteSupplier } = useSuppliersState();
  const { clients, upsertClient, deleteClient } = useClientsState();
  const { orders, createOrder, registerPayment, updateOrderStatus } = useOrdersState();
  const { products, upsertProduct, adjustProductStock, registerOrderReturn, updateStock } = useProductsState();
  const { purchases, createPurchase } = usePurchasesState();
  const handleUpdateOrderStatus = (orderId, nextStatus) => {
    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) return;
    const previousStatus = targetOrder.status;
    updateOrderStatus(orderId, nextStatus);
    if (previousStatus === "Entregado" && nextStatus === "Cancelado") {
      registerOrderReturn(targetOrder);
    }
  };
  const handleCreatePurchase = (purchaseData) => {
    const createdPurchase = createPurchase(purchaseData);
    if (!createdPurchase) return;
    createdPurchase.items.forEach((item) => {
      updateStock(item.productId, item.quantity, "compra", `Compra a ${createdPurchase.supplierName}`, createdPurchase.createdAt);
    });
  };
  const handleCreateOrder = (orderData) => {
    createOrder(orderData);
    const movementType = orderData.isSample ? "muestra" : "venta";
    const reasonBase = orderData.isSample ? "Salida por muestra" : `Venta pedido ${orderData.id}`;
    (Array.isArray(orderData.items) ? orderData.items : []).forEach((item) => {
      const qty = Number(item.quantity) || 0;
      if (qty <= 0 || !item.productId) return;
      updateStock(item.productId, qty, movementType, `${reasonBase}`, orderData.createdAt);
    });
  };
  return /* @__PURE__ */ jsxDEV(HashRouter, { children: /* @__PURE__ */ jsxDEV(Routes, { children: /* @__PURE__ */ jsxDEV(Route, { element: /* @__PURE__ */ jsxDEV(AppLayout, {}, void 0, false, {
    fileName: "C:/Packya Software/src/App.jsx",
    lineNumber: 64,
    columnNumber: 25
  }, this), children: [
    /* @__PURE__ */ jsxDEV(Route, { index: true, element: /* @__PURE__ */ jsxDEV(Navigate, { to: "/dashboard", replace: true }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 65,
      columnNumber: 33
    }, this) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 65,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: "/dashboard",
        element: /* @__PURE__ */ jsxDEV(DashboardPage, { orders, products, clients, purchases }, void 0, false, {
          fileName: "C:/Packya Software/src/App.jsx",
          lineNumber: 68,
          columnNumber: 22
        }, this)
      },
      void 0,
      false,
      {
        fileName: "C:/Packya Software/src/App.jsx",
        lineNumber: 66,
        columnNumber: 11
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(Route, { path: "/finanzas", element: /* @__PURE__ */ jsxDEV(FinancePage, { orders, purchases }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 70,
      columnNumber: 44
    }, this) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 70,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: "/pedidos",
        element: /* @__PURE__ */ jsxDEV(
          OrdersPage,
          {
            orders,
            products,
            clients,
            onCreateOrder: handleCreateOrder,
            onRegisterPayment: registerPayment,
            onUpdateOrderStatus: handleUpdateOrderStatus,
            onQuickCreateClient: upsertClient
          },
          void 0,
          false,
          {
            fileName: "C:/Packya Software/src/App.jsx",
            lineNumber: 74,
            columnNumber: 13
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "C:/Packya Software/src/App.jsx",
        lineNumber: 71,
        columnNumber: 11
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: "/clientes",
        element: /* @__PURE__ */ jsxDEV(
          ClientsPage,
          {
            clients,
            orders,
            onSaveClient: upsertClient,
            onDeleteClient: deleteClient
          },
          void 0,
          false,
          {
            fileName: "C:/Packya Software/src/App.jsx",
            lineNumber: 88,
            columnNumber: 13
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "C:/Packya Software/src/App.jsx",
        lineNumber: 85,
        columnNumber: 11
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: "/productos",
        element: /* @__PURE__ */ jsxDEV(
          ProductsPage,
          {
            products,
            orders,
            onSaveProduct: upsertProduct,
            onAdjustStock: adjustProductStock
          },
          void 0,
          false,
          {
            fileName: "C:/Packya Software/src/App.jsx",
            lineNumber: 99,
            columnNumber: 13
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "C:/Packya Software/src/App.jsx",
        lineNumber: 96,
        columnNumber: 11
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(
      Route,
      {
        path: "/compras",
        element: /* @__PURE__ */ jsxDEV(
          PurchasesPage,
          {
            products,
            purchases,
            suppliers,
            onCreatePurchase: handleCreatePurchase,
            onSaveSupplier: upsertSupplier,
            onDeleteSupplier: deleteSupplier
          },
          void 0,
          false,
          {
            fileName: "C:/Packya Software/src/App.jsx",
            lineNumber: 110,
            columnNumber: 13
          },
          this
        )
      },
      void 0,
      false,
      {
        fileName: "C:/Packya Software/src/App.jsx",
        lineNumber: 107,
        columnNumber: 11
      },
      this
    ),
    /* @__PURE__ */ jsxDEV(Route, { path: "/configuracion", element: /* @__PURE__ */ jsxDEV(SettingsPage, {}, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 120,
      columnNumber: 49
    }, this) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 120,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV(Route, { path: "/stock", element: /* @__PURE__ */ jsxDEV(StockPage, { products, onAdjustStock: (productId, amount, reason, date) => updateStock(productId, amount, "ajuste", reason, date) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 121,
      columnNumber: 41
    }, this) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 121,
      columnNumber: 11
    }, this),
    /* @__PURE__ */ jsxDEV(Route, { path: "*", element: /* @__PURE__ */ jsxDEV(Navigate, { to: "/dashboard", replace: true }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 122,
      columnNumber: 36
    }, this) }, void 0, false, {
      fileName: "C:/Packya Software/src/App.jsx",
      lineNumber: 122,
      columnNumber: 11
    }, this)
  ] }, void 0, true, {
    fileName: "C:/Packya Software/src/App.jsx",
    lineNumber: 64,
    columnNumber: 9
  }, this) }, void 0, false, {
    fileName: "C:/Packya Software/src/App.jsx",
    lineNumber: 63,
    columnNumber: 7
  }, this) }, void 0, false, {
    fileName: "C:/Packya Software/src/App.jsx",
    lineNumber: 62,
    columnNumber: 5
  }, this);
}
_s(App, "7PSsXwkU79OjSYPHLE3HuIM8/L0=", false, function() {
  return [useSuppliersState, useClientsState, useOrdersState, useProductsState, usePurchasesState];
});
_c = App;
export default App;
var _c;
$RefreshReg$(_c, "App");
import * as RefreshRuntime from "/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope;
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }
  RefreshRuntime.__hmr_import(import.meta.url).then((currentExports) => {
    RefreshRuntime.registerExportsForReactRefresh("C:/Packya Software/src/App.jsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("C:/Packya Software/src/App.jsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}
function $RefreshReg$(type, id) {
  return RefreshRuntime.register(type, "C:/Packya Software/src/App.jsx " + id);
}
function $RefreshSig$() {
  return RefreshRuntime.createSignatureFunctionForTransform();
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6IkFBK0R3Qjs7QUEvRHhCLFNBQVNBLFlBQVlDLFVBQVVDLE9BQU9DLGNBQWM7QUFDcEQsT0FBT0MsZUFBZTtBQUN0QixPQUFPQyxpQkFBaUI7QUFDeEIsT0FBT0MsbUJBQW1CO0FBQzFCLE9BQU9DLGlCQUFpQjtBQUN4QixPQUFPQyxnQkFBZ0I7QUFDdkIsT0FBT0Msa0JBQWtCO0FBQ3pCLE9BQU9DLG1CQUFtQjtBQUMxQixPQUFPQyxrQkFBa0I7QUFDekIsT0FBT0MsZUFBZTtBQUN0QixPQUFPQyxxQkFBcUI7QUFDNUIsT0FBT0Msb0JBQW9CO0FBQzNCLE9BQU9DLHNCQUFzQjtBQUM3QixPQUFPQyx1QkFBdUI7QUFDOUIsT0FBT0MsdUJBQXVCO0FBRTlCLFNBQVNDLE1BQU07QUFBQUMsS0FBQTtBQUNiLFFBQU0sRUFBRUMsV0FBV0MsZ0JBQWdCQyxlQUFlLElBQUlMLGtCQUFrQjtBQUN4RSxRQUFNLEVBQUVNLFNBQVNDLGNBQWNDLGFBQWEsSUFBSVosZ0JBQWdCO0FBQ2hFLFFBQU0sRUFBRWEsUUFBUUMsYUFBYUMsaUJBQWlCQyxrQkFBa0IsSUFBSWYsZUFBZTtBQUNuRixRQUFNLEVBQUVnQixVQUFVQyxlQUFlQyxvQkFBb0JDLHFCQUFxQkMsWUFBWSxJQUFJbkIsaUJBQWlCO0FBQzNHLFFBQU0sRUFBRW9CLFdBQVdDLGVBQWUsSUFBSXBCLGtCQUFrQjtBQUV4RCxRQUFNcUIsMEJBQTBCQSxDQUFDQyxTQUFTQyxlQUFlO0FBQ3ZELFVBQU1DLGNBQWNkLE9BQU9lLEtBQUssQ0FBQ0MsVUFBVUEsTUFBTUMsT0FBT0wsT0FBTztBQUMvRCxRQUFJLENBQUNFLFlBQWE7QUFFbEIsVUFBTUksaUJBQWlCSixZQUFZSztBQUNuQ2hCLHNCQUFrQlMsU0FBU0MsVUFBVTtBQUVyQyxRQUFJSyxtQkFBbUIsZUFBZUwsZUFBZSxhQUFhO0FBQ2hFTiwwQkFBb0JPLFdBQVc7QUFBQSxJQUNqQztBQUFBLEVBQ0Y7QUFFQSxRQUFNTSx1QkFBdUJBLENBQUNDLGlCQUFpQjtBQUM3QyxVQUFNQyxrQkFBa0JaLGVBQWVXLFlBQVk7QUFDbkQsUUFBSSxDQUFDQyxnQkFBaUI7QUFFdEJBLG9CQUFnQkMsTUFBTUMsUUFBUSxDQUFDQyxTQUFTO0FBRXRDakIsa0JBQVlpQixLQUFLQyxXQUFXRCxLQUFLRSxVQUFVLFVBQVUsWUFBWUwsZ0JBQWdCTSxZQUFZLElBQUlOLGdCQUFnQk8sU0FBUztBQUFBLElBQzVILENBQUM7QUFBQSxFQUNIO0FBRUEsUUFBTUMsb0JBQW9CQSxDQUFDQyxjQUFjO0FBRXZDOUIsZ0JBQVk4QixTQUFTO0FBR3JCLFVBQU1DLGVBQWVELFVBQVVFLFdBQVcsWUFBWTtBQUN0RCxVQUFNQyxhQUFhSCxVQUFVRSxXQUFXLHVCQUF1QixnQkFBZ0JGLFVBQVVkLEVBQUU7QUFFMUYsS0FBQ2tCLE1BQU1DLFFBQVFMLFVBQVVSLEtBQUssSUFBSVEsVUFBVVIsUUFBUSxJQUFJQyxRQUFRLENBQUNDLFNBQVM7QUFDekUsWUFBTVksTUFBTUMsT0FBT2IsS0FBS0UsUUFBUSxLQUFLO0FBQ3JDLFVBQUlVLE9BQU8sS0FBSyxDQUFDWixLQUFLQyxVQUFXO0FBQ2pDbEIsa0JBQVlpQixLQUFLQyxXQUFXVyxLQUFLTCxjQUFjLEdBQUdFLFVBQVUsSUFBSUgsVUFBVUYsU0FBUztBQUFBLElBQ3JGLENBQUM7QUFBQSxFQUNIO0FBRUEsU0FDRSx1QkFBQyxjQUNDLGlDQUFDLFVBQ0MsaUNBQUMsU0FBTSxTQUFTLHVCQUFDLGVBQUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFVLEdBQ3hCO0FBQUEsMkJBQUMsU0FBTSxPQUFLLE1BQUMsU0FBUyx1QkFBQyxZQUFTLElBQUcsY0FBYSxTQUFPLFFBQWpDO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBaUMsS0FBdkQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUEyRDtBQUFBLElBQzNEO0FBQUEsTUFBQztBQUFBO0FBQUEsUUFDQyxNQUFLO0FBQUEsUUFDTCxTQUFTLHVCQUFDLGlCQUFjLFFBQWdCLFVBQW9CLFNBQWtCLGFBQXJFO0FBQUE7QUFBQTtBQUFBO0FBQUEsZUFBMEY7QUFBQTtBQUFBLE1BRnJHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUV5RztBQUFBLElBRXpHLHVCQUFDLFNBQU0sTUFBSyxhQUFZLFNBQVMsdUJBQUMsZUFBWSxRQUFnQixhQUE3QjtBQUFBO0FBQUE7QUFBQTtBQUFBLFdBQWtELEtBQW5GO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBdUY7QUFBQSxJQUN2RjtBQUFBLE1BQUM7QUFBQTtBQUFBLFFBQ0MsTUFBSztBQUFBLFFBQ0wsU0FDRTtBQUFBLFVBQUM7QUFBQTtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0EsZUFBZUM7QUFBQUEsWUFDZixtQkFBbUI1QjtBQUFBQSxZQUNuQixxQkFBcUJTO0FBQUFBLFlBQ3JCLHFCQUFxQmI7QUFBQUE7QUFBQUEsVUFQdkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBT29DO0FBQUE7QUFBQSxNQVZ4QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFZRztBQUFBLElBRUg7QUFBQSxNQUFDO0FBQUE7QUFBQSxRQUNDLE1BQUs7QUFBQSxRQUNMLFNBQ0U7QUFBQSxVQUFDO0FBQUE7QUFBQSxZQUNDO0FBQUEsWUFDQTtBQUFBLFlBQ0EsY0FBY0E7QUFBQUEsWUFDZCxnQkFBZ0JDO0FBQUFBO0FBQUFBLFVBSmxCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUkrQjtBQUFBO0FBQUEsTUFQbkM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBU0c7QUFBQSxJQUVIO0FBQUEsTUFBQztBQUFBO0FBQUEsUUFDQyxNQUFLO0FBQUEsUUFDTCxTQUNFO0FBQUEsVUFBQztBQUFBO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxZQUNBLGVBQWVNO0FBQUFBLFlBQ2YsZUFBZUM7QUFBQUE7QUFBQUEsVUFKakI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBSW9DO0FBQUE7QUFBQSxNQVB4QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFTRztBQUFBLElBRUg7QUFBQSxNQUFDO0FBQUE7QUFBQSxRQUNDLE1BQUs7QUFBQSxRQUNMLFNBQ0U7QUFBQSxVQUFDO0FBQUE7QUFBQSxZQUNDO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBLGtCQUFrQmM7QUFBQUEsWUFDbEIsZ0JBQWdCekI7QUFBQUEsWUFDaEIsa0JBQWtCQztBQUFBQTtBQUFBQSxVQU5wQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFNbUM7QUFBQTtBQUFBLE1BVHZDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQVdHO0FBQUEsSUFFSCx1QkFBQyxTQUFNLE1BQUssa0JBQWlCLFNBQVMsdUJBQUMsa0JBQUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUFhLEtBQW5EO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBdUQ7QUFBQSxJQUN2RCx1QkFBQyxTQUFNLE1BQUssVUFBUyxTQUFTLHVCQUFDLGFBQVUsVUFBb0IsZUFBZSxDQUFDOEIsV0FBV2EsUUFBUUMsUUFBUUMsU0FBU2pDLFlBQVlrQixXQUFXYSxRQUFRLFVBQVVDLFFBQVFDLElBQUksS0FBeEk7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUEwSSxLQUF4SztBQUFBO0FBQUE7QUFBQTtBQUFBLFdBQTRLO0FBQUEsSUFDNUssdUJBQUMsU0FBTSxNQUFLLEtBQUksU0FBUyx1QkFBQyxZQUFTLElBQUcsY0FBYSxTQUFPLFFBQWpDO0FBQUE7QUFBQTtBQUFBO0FBQUEsV0FBaUMsS0FBMUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxXQUE4RDtBQUFBLE9BMURoRTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBMkRBLEtBNURGO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0E2REEsS0E5REY7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQStEQTtBQUVKO0FBQUNoRCxHQTlHUUQsS0FBRztBQUFBLFVBQzRDRCxtQkFDTkosaUJBQ29CQyxnQkFDc0JDLGtCQUNwREMsaUJBQWlCO0FBQUE7QUFBQSxLQUxoREU7QUFnSFQsZUFBZUE7QUFBRyxJQUFBa0Q7QUFBQSxhQUFBQSxJQUFBIiwibmFtZXMiOlsiSGFzaFJvdXRlciIsIk5hdmlnYXRlIiwiUm91dGUiLCJSb3V0ZXMiLCJBcHBMYXlvdXQiLCJDbGllbnRzUGFnZSIsIkRhc2hib2FyZFBhZ2UiLCJGaW5hbmNlUGFnZSIsIk9yZGVyc1BhZ2UiLCJQcm9kdWN0c1BhZ2UiLCJQdXJjaGFzZXNQYWdlIiwiU2V0dGluZ3NQYWdlIiwiU3RvY2tQYWdlIiwidXNlQ2xpZW50c1N0YXRlIiwidXNlT3JkZXJzU3RhdGUiLCJ1c2VQcm9kdWN0c1N0YXRlIiwidXNlUHVyY2hhc2VzU3RhdGUiLCJ1c2VTdXBwbGllcnNTdGF0ZSIsIkFwcCIsIl9zIiwic3VwcGxpZXJzIiwidXBzZXJ0U3VwcGxpZXIiLCJkZWxldGVTdXBwbGllciIsImNsaWVudHMiLCJ1cHNlcnRDbGllbnQiLCJkZWxldGVDbGllbnQiLCJvcmRlcnMiLCJjcmVhdGVPcmRlciIsInJlZ2lzdGVyUGF5bWVudCIsInVwZGF0ZU9yZGVyU3RhdHVzIiwicHJvZHVjdHMiLCJ1cHNlcnRQcm9kdWN0IiwiYWRqdXN0UHJvZHVjdFN0b2NrIiwicmVnaXN0ZXJPcmRlclJldHVybiIsInVwZGF0ZVN0b2NrIiwicHVyY2hhc2VzIiwiY3JlYXRlUHVyY2hhc2UiLCJoYW5kbGVVcGRhdGVPcmRlclN0YXR1cyIsIm9yZGVySWQiLCJuZXh0U3RhdHVzIiwidGFyZ2V0T3JkZXIiLCJmaW5kIiwib3JkZXIiLCJpZCIsInByZXZpb3VzU3RhdHVzIiwic3RhdHVzIiwiaGFuZGxlQ3JlYXRlUHVyY2hhc2UiLCJwdXJjaGFzZURhdGEiLCJjcmVhdGVkUHVyY2hhc2UiLCJpdGVtcyIsImZvckVhY2giLCJpdGVtIiwicHJvZHVjdElkIiwicXVhbnRpdHkiLCJzdXBwbGllck5hbWUiLCJjcmVhdGVkQXQiLCJoYW5kbGVDcmVhdGVPcmRlciIsIm9yZGVyRGF0YSIsIm1vdmVtZW50VHlwZSIsImlzU2FtcGxlIiwicmVhc29uQmFzZSIsIkFycmF5IiwiaXNBcnJheSIsInF0eSIsIk51bWJlciIsImFtb3VudCIsInJlYXNvbiIsImRhdGUiLCJfYyJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlcyI6WyJBcHAuanN4Il0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEhhc2hSb3V0ZXIsIE5hdmlnYXRlLCBSb3V0ZSwgUm91dGVzIH0gZnJvbSAncmVhY3Qtcm91dGVyLWRvbSdcbmltcG9ydCBBcHBMYXlvdXQgZnJvbSAnLi9sYXlvdXQvQXBwTGF5b3V0J1xuaW1wb3J0IENsaWVudHNQYWdlIGZyb20gJy4vcGFnZXMvQ2xpZW50c1BhZ2UnXG5pbXBvcnQgRGFzaGJvYXJkUGFnZSBmcm9tICcuL3BhZ2VzL0Rhc2hib2FyZFBhZ2UnXG5pbXBvcnQgRmluYW5jZVBhZ2UgZnJvbSAnLi9wYWdlcy9GaW5hbmNlUGFnZSdcbmltcG9ydCBPcmRlcnNQYWdlIGZyb20gJy4vcGFnZXMvT3JkZXJzUGFnZSdcbmltcG9ydCBQcm9kdWN0c1BhZ2UgZnJvbSAnLi9wYWdlcy9Qcm9kdWN0c1BhZ2UnXG5pbXBvcnQgUHVyY2hhc2VzUGFnZSBmcm9tICcuL3BhZ2VzL1B1cmNoYXNlc1BhZ2UnXG5pbXBvcnQgU2V0dGluZ3NQYWdlIGZyb20gJy4vcGFnZXMvU2V0dGluZ3NQYWdlJ1xuaW1wb3J0IFN0b2NrUGFnZSBmcm9tICcuL3BhZ2VzL1N0b2NrUGFnZSdcbmltcG9ydCB1c2VDbGllbnRzU3RhdGUgZnJvbSAnLi9zdGF0ZS91c2VDbGllbnRzU3RhdGUnXG5pbXBvcnQgdXNlT3JkZXJzU3RhdGUgZnJvbSAnLi9zdGF0ZS91c2VPcmRlcnNTdGF0ZSdcbmltcG9ydCB1c2VQcm9kdWN0c1N0YXRlIGZyb20gJy4vc3RhdGUvdXNlUHJvZHVjdHNTdGF0ZSdcbmltcG9ydCB1c2VQdXJjaGFzZXNTdGF0ZSBmcm9tICcuL3N0YXRlL3VzZVB1cmNoYXNlc1N0YXRlJ1xuaW1wb3J0IHVzZVN1cHBsaWVyc1N0YXRlIGZyb20gJy4vc3RhdGUvdXNlU3VwcGxpZXJzU3RhdGUnXG5cbmZ1bmN0aW9uIEFwcCgpIHtcbiAgY29uc3QgeyBzdXBwbGllcnMsIHVwc2VydFN1cHBsaWVyLCBkZWxldGVTdXBwbGllciB9ID0gdXNlU3VwcGxpZXJzU3RhdGUoKVxuICBjb25zdCB7IGNsaWVudHMsIHVwc2VydENsaWVudCwgZGVsZXRlQ2xpZW50IH0gPSB1c2VDbGllbnRzU3RhdGUoKVxuICBjb25zdCB7IG9yZGVycywgY3JlYXRlT3JkZXIsIHJlZ2lzdGVyUGF5bWVudCwgdXBkYXRlT3JkZXJTdGF0dXMgfSA9IHVzZU9yZGVyc1N0YXRlKClcbiAgY29uc3QgeyBwcm9kdWN0cywgdXBzZXJ0UHJvZHVjdCwgYWRqdXN0UHJvZHVjdFN0b2NrLCByZWdpc3Rlck9yZGVyUmV0dXJuLCB1cGRhdGVTdG9jayB9ID0gdXNlUHJvZHVjdHNTdGF0ZSgpXG4gIGNvbnN0IHsgcHVyY2hhc2VzLCBjcmVhdGVQdXJjaGFzZSB9ID0gdXNlUHVyY2hhc2VzU3RhdGUoKVxuXG4gIGNvbnN0IGhhbmRsZVVwZGF0ZU9yZGVyU3RhdHVzID0gKG9yZGVySWQsIG5leHRTdGF0dXMpID0+IHtcbiAgICBjb25zdCB0YXJnZXRPcmRlciA9IG9yZGVycy5maW5kKChvcmRlcikgPT4gb3JkZXIuaWQgPT09IG9yZGVySWQpXG4gICAgaWYgKCF0YXJnZXRPcmRlcikgcmV0dXJuXG5cbiAgICBjb25zdCBwcmV2aW91c1N0YXR1cyA9IHRhcmdldE9yZGVyLnN0YXR1c1xuICAgIHVwZGF0ZU9yZGVyU3RhdHVzKG9yZGVySWQsIG5leHRTdGF0dXMpXG5cbiAgICBpZiAocHJldmlvdXNTdGF0dXMgPT09ICdFbnRyZWdhZG8nICYmIG5leHRTdGF0dXMgPT09ICdDYW5jZWxhZG8nKSB7XG4gICAgICByZWdpc3Rlck9yZGVyUmV0dXJuKHRhcmdldE9yZGVyKVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGhhbmRsZUNyZWF0ZVB1cmNoYXNlID0gKHB1cmNoYXNlRGF0YSkgPT4ge1xuICAgIGNvbnN0IGNyZWF0ZWRQdXJjaGFzZSA9IGNyZWF0ZVB1cmNoYXNlKHB1cmNoYXNlRGF0YSlcbiAgICBpZiAoIWNyZWF0ZWRQdXJjaGFzZSkgcmV0dXJuXG5cbiAgICBjcmVhdGVkUHVyY2hhc2UuaXRlbXMuZm9yRWFjaCgoaXRlbSkgPT4ge1xuICAgICAgLy8gSW5jcmVhc2Ugc3RvY2sgYnkgcHVyY2hhc2VkIHVuaXRzXG4gICAgICB1cGRhdGVTdG9jayhpdGVtLnByb2R1Y3RJZCwgaXRlbS5xdWFudGl0eSwgJ2NvbXByYScsIGBDb21wcmEgYSAke2NyZWF0ZWRQdXJjaGFzZS5zdXBwbGllck5hbWV9YCwgY3JlYXRlZFB1cmNoYXNlLmNyZWF0ZWRBdClcbiAgICB9KVxuICB9XG5cbiAgY29uc3QgaGFuZGxlQ3JlYXRlT3JkZXIgPSAob3JkZXJEYXRhKSA9PiB7XG4gICAgLy8gY3JlYXRlIG9yZGVyIGluIG9yZGVycyBzdGF0ZVxuICAgIGNyZWF0ZU9yZGVyKG9yZGVyRGF0YSlcblxuICAgIC8vIHVwZGF0ZSBzdG9jazogdmVudGFzIG8gbXVlc3RyYXNcbiAgICBjb25zdCBtb3ZlbWVudFR5cGUgPSBvcmRlckRhdGEuaXNTYW1wbGUgPyAnbXVlc3RyYScgOiAndmVudGEnXG4gICAgY29uc3QgcmVhc29uQmFzZSA9IG9yZGVyRGF0YS5pc1NhbXBsZSA/ICdTYWxpZGEgcG9yIG11ZXN0cmEnIDogYFZlbnRhIHBlZGlkbyAke29yZGVyRGF0YS5pZH1gXG5cbiAgICA7KEFycmF5LmlzQXJyYXkob3JkZXJEYXRhLml0ZW1zKSA/IG9yZGVyRGF0YS5pdGVtcyA6IFtdKS5mb3JFYWNoKChpdGVtKSA9PiB7XG4gICAgICBjb25zdCBxdHkgPSBOdW1iZXIoaXRlbS5xdWFudGl0eSkgfHwgMFxuICAgICAgaWYgKHF0eSA8PSAwIHx8ICFpdGVtLnByb2R1Y3RJZCkgcmV0dXJuXG4gICAgICB1cGRhdGVTdG9jayhpdGVtLnByb2R1Y3RJZCwgcXR5LCBtb3ZlbWVudFR5cGUsIGAke3JlYXNvbkJhc2V9YCwgb3JkZXJEYXRhLmNyZWF0ZWRBdClcbiAgICB9KVxuICB9XG5cbiAgcmV0dXJuIChcbiAgICA8SGFzaFJvdXRlcj5cbiAgICAgIDxSb3V0ZXM+XG4gICAgICAgIDxSb3V0ZSBlbGVtZW50PXs8QXBwTGF5b3V0IC8+fT5cbiAgICAgICAgICA8Um91dGUgaW5kZXggZWxlbWVudD17PE5hdmlnYXRlIHRvPVwiL2Rhc2hib2FyZFwiIHJlcGxhY2UgLz59IC8+XG4gICAgICAgICAgPFJvdXRlXG4gICAgICAgICAgICBwYXRoPVwiL2Rhc2hib2FyZFwiXG4gICAgICAgICAgICBlbGVtZW50PXs8RGFzaGJvYXJkUGFnZSBvcmRlcnM9e29yZGVyc30gcHJvZHVjdHM9e3Byb2R1Y3RzfSBjbGllbnRzPXtjbGllbnRzfSBwdXJjaGFzZXM9e3B1cmNoYXNlc30gLz59XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8Um91dGUgcGF0aD1cIi9maW5hbnphc1wiIGVsZW1lbnQ9ezxGaW5hbmNlUGFnZSBvcmRlcnM9e29yZGVyc30gcHVyY2hhc2VzPXtwdXJjaGFzZXN9IC8+fSAvPlxuICAgICAgICAgIDxSb3V0ZVxuICAgICAgICAgICAgcGF0aD1cIi9wZWRpZG9zXCJcbiAgICAgICAgICAgIGVsZW1lbnQ9e1xuICAgICAgICAgICAgICA8T3JkZXJzUGFnZVxuICAgICAgICAgICAgICAgIG9yZGVycz17b3JkZXJzfVxuICAgICAgICAgICAgICAgIHByb2R1Y3RzPXtwcm9kdWN0c31cbiAgICAgICAgICAgICAgICBjbGllbnRzPXtjbGllbnRzfVxuICAgICAgICAgICAgICAgIG9uQ3JlYXRlT3JkZXI9e2hhbmRsZUNyZWF0ZU9yZGVyfVxuICAgICAgICAgICAgICAgIG9uUmVnaXN0ZXJQYXltZW50PXtyZWdpc3RlclBheW1lbnR9XG4gICAgICAgICAgICAgICAgb25VcGRhdGVPcmRlclN0YXR1cz17aGFuZGxlVXBkYXRlT3JkZXJTdGF0dXN9XG4gICAgICAgICAgICAgICAgb25RdWlja0NyZWF0ZUNsaWVudD17dXBzZXJ0Q2xpZW50fVxuICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPFJvdXRlXG4gICAgICAgICAgICBwYXRoPVwiL2NsaWVudGVzXCJcbiAgICAgICAgICAgIGVsZW1lbnQ9e1xuICAgICAgICAgICAgICA8Q2xpZW50c1BhZ2VcbiAgICAgICAgICAgICAgICBjbGllbnRzPXtjbGllbnRzfVxuICAgICAgICAgICAgICAgIG9yZGVycz17b3JkZXJzfVxuICAgICAgICAgICAgICAgIG9uU2F2ZUNsaWVudD17dXBzZXJ0Q2xpZW50fVxuICAgICAgICAgICAgICAgIG9uRGVsZXRlQ2xpZW50PXtkZWxldGVDbGllbnR9XG4gICAgICAgICAgICAgIC8+XG4gICAgICAgICAgICB9XG4gICAgICAgICAgLz5cbiAgICAgICAgICA8Um91dGVcbiAgICAgICAgICAgIHBhdGg9XCIvcHJvZHVjdG9zXCJcbiAgICAgICAgICAgIGVsZW1lbnQ9e1xuICAgICAgICAgICAgICA8UHJvZHVjdHNQYWdlXG4gICAgICAgICAgICAgICAgcHJvZHVjdHM9e3Byb2R1Y3RzfVxuICAgICAgICAgICAgICAgIG9yZGVycz17b3JkZXJzfVxuICAgICAgICAgICAgICAgIG9uU2F2ZVByb2R1Y3Q9e3Vwc2VydFByb2R1Y3R9XG4gICAgICAgICAgICAgICAgb25BZGp1c3RTdG9jaz17YWRqdXN0UHJvZHVjdFN0b2NrfVxuICAgICAgICAgICAgICAvPlxuICAgICAgICAgICAgfVxuICAgICAgICAgIC8+XG4gICAgICAgICAgPFJvdXRlXG4gICAgICAgICAgICBwYXRoPVwiL2NvbXByYXNcIlxuICAgICAgICAgICAgZWxlbWVudD17XG4gICAgICAgICAgICAgIDxQdXJjaGFzZXNQYWdlXG4gICAgICAgICAgICAgICAgcHJvZHVjdHM9e3Byb2R1Y3RzfVxuICAgICAgICAgICAgICAgIHB1cmNoYXNlcz17cHVyY2hhc2VzfVxuICAgICAgICAgICAgICAgIHN1cHBsaWVycz17c3VwcGxpZXJzfVxuICAgICAgICAgICAgICAgIG9uQ3JlYXRlUHVyY2hhc2U9e2hhbmRsZUNyZWF0ZVB1cmNoYXNlfVxuICAgICAgICAgICAgICAgIG9uU2F2ZVN1cHBsaWVyPXt1cHNlcnRTdXBwbGllcn1cbiAgICAgICAgICAgICAgICBvbkRlbGV0ZVN1cHBsaWVyPXtkZWxldGVTdXBwbGllcn1cbiAgICAgICAgICAgICAgLz5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAvPlxuICAgICAgICAgIDxSb3V0ZSBwYXRoPVwiL2NvbmZpZ3VyYWNpb25cIiBlbGVtZW50PXs8U2V0dGluZ3NQYWdlIC8+fSAvPlxuICAgICAgICAgIDxSb3V0ZSBwYXRoPVwiL3N0b2NrXCIgZWxlbWVudD17PFN0b2NrUGFnZSBwcm9kdWN0cz17cHJvZHVjdHN9IG9uQWRqdXN0U3RvY2s9eyhwcm9kdWN0SWQsIGFtb3VudCwgcmVhc29uLCBkYXRlKSA9PiB1cGRhdGVTdG9jayhwcm9kdWN0SWQsIGFtb3VudCwgJ2FqdXN0ZScsIHJlYXNvbiwgZGF0ZSl9IC8+fSAvPlxuICAgICAgICAgIDxSb3V0ZSBwYXRoPVwiKlwiIGVsZW1lbnQ9ezxOYXZpZ2F0ZSB0bz1cIi9kYXNoYm9hcmRcIiByZXBsYWNlIC8+fSAvPlxuICAgICAgICA8L1JvdXRlPlxuICAgICAgPC9Sb3V0ZXM+XG4gICAgPC9IYXNoUm91dGVyPlxuICApXG59XG5cbmV4cG9ydCBkZWZhdWx0IEFwcFxuIl0sImZpbGUiOiJDOi9QYWNreWEgU29mdHdhcmUvc3JjL0FwcC5qc3gifQ==