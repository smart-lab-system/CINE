

// User function Template for Java

class Solution {
    
    public int checkisCircle(ArrayList<String> arr, char start, char priLast) {

  if (arr.size() == 1) {

    if (arr.get(0).charAt(0) == arr.get(0).charAt(arr.get(0).length() - 1)) {
      return 1;
    }
    return 0;
  }

  char currentFirst = ' ';
  char currentLast = ' ';
  int i = 0;

  Iterator<String> iterator = arr.iterator();

  ArrayList<String> arr2list = new ArrayList<>();
  while (iterator.hasNext()) {

    String data = iterator.next();
    currentFirst = data.charAt(0);
    currentLast = data.charAt(data.length() - 1);

    if (i == 0) {
      i++;
      continue;
    }

    if (currentFirst != priLast && !iterator.hasNext()) {

      if (arr2list.size() > 0 && arr2list.size() != arr.size()) {

        return checkisCircle(arr2list, currentFirst, currentLast);
      }
      return 0;
    }

    if (currentFirst == priLast) {
      priLast = currentLast;
      continue;
    }

    if (currentFirst != priLast) {
      arr2list.add(data);
    }
  }


  return 1;

}

  
  public int isCircle(String arr[]) {
      // code here
      
      if(arr.length == 0){
          return 0;
      }
      
      if(arr.length == 1){
          String data = arr[0];

          if (data.charAt(0) == data.charAt((data.length() - 1))) {
              return 1;
          } 
          return 0;
          
      }
      
ArrayList<String> arrList = new ArrayList<>();

  arrList.addAll(List.of(arr));

  return checkisCircle(arrList, arr[0].charAt(0), arr[0].charAt(arr[0].length() - 1));
}
      
  
}