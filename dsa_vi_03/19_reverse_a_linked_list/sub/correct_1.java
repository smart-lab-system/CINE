

// function Template for Java

/* linked list node class:

class Node {
    int data;
    Node next;
    Node(int value) {
        this.value = value;
    }
}

*/

class Solution {
    Node reverseList(Node head) {
        if(head == null) return null;
        return solve(head);
    }
    Node solve(Node head){
        if(head == null || head.next ==null) return head;
         Node newNode = solve(head.next);
         head.next.next = head;
         head.next =null;
         
         return newNode;
    }
}