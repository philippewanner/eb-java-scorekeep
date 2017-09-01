var module = angular.module('scorekeep');
module.controller('CognitoController', Cognito);
function Cognito($scope, $http, UserService, api) {
  // Scope
  $scope.username = "myname";
  $scope.password = "testpassword";
  $scope.user = {};
  $scope.cognitoUser = {};
  $scope.errormessage = "";
  $scope.userpooldata = {};
  $scope.servicegraph = "";

  if ( sessionStorage['username'] ) {
    $scope.username = sessionStorage['username'];
  }
  // Get region, userpool ID and client ID from Scorekeep API
  var userPool;
  GetUserPool = $http.get( api + 'userpool');
  GetUserPool.then( function(userpool){
    $scope.userpooldata = angular.copy(userpool.data);
    // Configure region
    AWSCognito.config.region = $scope.userpooldata.region;
    AWS.config.region = $scope.userpooldata.region;
    var poolData = {
      UserPoolId : $scope.userpooldata.poolId,
      ClientId : $scope.userpooldata.clientId
    };
    userPool = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
    // Configure AWS SDK credentials if user is signed in
    if ( sessionStorage['JWTToken'] ) {
      $scope.getAWSCredentials(sessionStorage['JWTToken']);
    }
  })

  $scope.createUser = function () {
    $scope.errormessage = "";
    user = new UserService();
    // Create scorekeep user
    CreateScorekeepUser = user.$save(function() {
      user.name = $scope.username;
      return user.$update({ id: user.id }, function() {
        $scope.user = angular.copy(user);
        return user;
      })
    })
    // Create cognito user
    CreateCognitoUser = CreateScorekeepUser.then( function(user) {
      var dataUserId = {
          Name : 'custom:userid',
          Value : user.id
      };
      var attributeUserId = new AWSCognito.CognitoIdentityServiceProvider.CognitoUserAttribute(dataUserId);
      var userData = {
        Username : $scope.username,
        Pool : userPool
      };
      var attributeList = [];
      attributeList.push(attributeUserId);
      var cognitoUser;
      return userPool.signUp($scope.username, $scope.password, attributeList, null, function(err, result){
        if (err) {
          // Delete scorekeep user if cognito signup fails
          $http.delete( api + 'user/' + user.id);
          $scope.errormessage = err.message;
          $scope.user = {};
          $scope.cognitoUser = {};
          return;
        }
        cognitoUser = result.user;
        $scope.cognitoUser = angular.copy(cognitoUser);
        return cognitoUser;
      });
    })
    CreateCognitoUser.then( function(user) {
      $scope.login();
    })
  };

  $scope.getAWSCredentials = function(JWTToken) {
    AWS.config.region = $scope.userpooldata.region;
    var logins = {};
    loginkey = 'cognito-idp.' + $scope.userpooldata.region + '.amazonaws.com/' + $scope.userpooldata.poolId;
    logins[loginkey] = JWTToken;
    var credentials = new AWS.CognitoIdentityCredentials({
      IdentityPoolId : $scope.userpooldata.identityPoolId,
      Logins : logins
    });
    AWS.config.credentials = credentials;
  }

  $scope.login = function() {
    $scope.errormessage = "";
    var authenticationData = {
      Username : $scope.username,
      Password : $scope.password,
    };

    var userData = {
      Username : $scope.username,
      Pool : userPool
    };

    var authenticationDetails = new AWSCognito.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);

    var cognitoUser = new AWSCognito.CognitoIdentityServiceProvider.CognitoUser(userData);
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: function (result) {
        cognitoUser.getUserAttributes(function(err, attributes){
          var userid;
          for (i=0; i < attributes.length ; i++) {
            if (attributes[i].Name == "custom:userid") {
              userid = attributes[i].Value;
              break;
            }
          }
          $scope.user = UserService.get({ id: userid });
          $scope.cognitoUser = angular.copy(cognitoUser);
        });
        var JWTToken = result.getIdToken().getJwtToken();
        $scope.getAWSCredentials(JWTToken);
        sessionStorage['username'] = $scope.username;
        sessionStorage['JWTToken'] = JWTToken;
      },
      onFailure: function(err) {
        $scope.errormessage = err.message;
      }
    });
  }

  $scope.logout = function() {
    $scope.errormessage = "";
    $scope.cognitoUser.signOut();
    console.log('Signed out from Cognito.');
    $scope.user = {};
    $scope.username = "";
    $scope.cognitoUser = {};
    $scope.errormessage = "";
    $scope.servicegraph = "";
    sessionStorage['JWTToken'] = "";
    sessionStorage['username'] = "";
  }

  $scope.deleteUser = function () {
    $scope.errormessage = "";
    var userId = $scope.user.id;
    if ( $scope.cognitoUser.deleteUser == null ) {
      $scope.errormessage = "Not signed in to Cognito."
      return;
    }
    $scope.cognitoUser.deleteUser(function(err, result) {
      if (err) {
        $scope.errormessage = err.message;
        return;
      }
      console.log('Cognito delete result: ' + result);
      $scope.user = {};
      $scope.cognitoUser = {};
      $http.delete( api + 'user/' + userId);
    });
  }

  $scope.callXray = function() {
    var xray = new AWS.XRay();
    var params = {
      EndTime: Date.now()/1000,
      StartTime: Date.now()/1000 - 600
    };
    xray.getServiceGraph(params, function(err, data) {
      if (err) {
        $scope.errormessage = JSON.stringify(err, null, 2);
        console.log(err, err.stack);
        $scope.$apply();
      } else {
        console.log(data);
        $scope.servicegraph = JSON.stringify(data, null, 2);
        $scope.errormessage = "";
        $scope.$apply();
      }
    })
  }
}
